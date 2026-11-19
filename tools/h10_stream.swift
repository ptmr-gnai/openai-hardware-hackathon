import CoreBluetooth
import Foundation

private let heartRateService = CBUUID(string: "180D")
private let heartRateMeasurement = CBUUID(string: "2A37")
private let batteryService = CBUUID(string: "180F")
private let batteryLevel = CBUUID(string: "2A19")

final class H10Client: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var central: CBCentralManager!
    private var target: CBPeripheral?
    private var timeout: Timer?
    private let scanOnly: Bool
    private let scanSeconds: TimeInterval
    private let jsonFile: URL?
    private var batteryPercent: UInt8?

    init(scanOnly: Bool, scanSeconds: TimeInterval, jsonFile: URL?) {
        self.scanOnly = scanOnly
        self.scanSeconds = scanSeconds
        self.jsonFile = jsonFile
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            print("Bluetooth ready. Scanning for Polar H10…")
            central.scanForPeripherals(
                withServices: nil,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
            timeout = Timer.scheduledTimer(withTimeInterval: scanSeconds, repeats: false) { [weak self] _ in
                guard let self = self, self.target == nil else { return }
                print("No Polar H10 detected in \(Int(self.scanSeconds)) seconds.")
                print("Wet the strap electrodes, wear it, and make sure its Bluetooth slots are not both occupied.")
                exit(2)
            }
        case .unauthorized:
            print("Bluetooth access is not authorized for this process.")
            print("Enable it in System Preferences > Security & Privacy > Privacy > Bluetooth.")
            exit(3)
        case .poweredOff:
            print("Bluetooth is off. Turn it on and retry.")
            exit(4)
        case .unsupported:
            print("Bluetooth LE is unsupported on this Mac.")
            exit(5)
        default:
            break
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = advertisedName ?? peripheral.name ?? ""
        let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        let isH10 = name.localizedCaseInsensitiveContains("Polar H10")
        let isPolarHR = name.localizedCaseInsensitiveContains("Polar") && services.contains(heartRateService)
        guard isH10 || isPolarHR else { return }

        timeout?.invalidate()
        target = peripheral
        central.stopScan()
        print("Detected \(name.isEmpty ? "Polar heart-rate sensor" : name) (RSSI \(RSSI) dBm).")

        if scanOnly {
            print("Detection successful.")
            exit(0)
        }

        peripheral.delegate = self
        print("Connecting…")
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("Connected. Discovering heart-rate and battery services…")
        peripheral.discoverServices([heartRateService, batteryService])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        print("Connection failed: \(error?.localizedDescription ?? "unknown error")")
        exit(6)
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        print("Disconnected: \(error?.localizedDescription ?? "sensor ended the connection")")
        exit(error == nil ? 0 : 7)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            print("Service discovery failed: \(error.localizedDescription)")
            exit(8)
        }
        for service in peripheral.services ?? [] {
            switch service.uuid {
            case heartRateService:
                peripheral.discoverCharacteristics([heartRateMeasurement], for: service)
            case batteryService:
                peripheral.discoverCharacteristics([batteryLevel], for: service)
            default:
                break
            }
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if let error = error {
            print("Characteristic discovery failed: \(error.localizedDescription)")
            return
        }
        for characteristic in service.characteristics ?? [] {
            if characteristic.uuid == heartRateMeasurement {
                print("Heart-rate stream ready. Waiting for measurements; press Control-C to stop.")
                peripheral.setNotifyValue(true, for: characteristic)
            } else if characteristic.uuid == batteryLevel {
                peripheral.readValue(for: characteristic)
            }
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let error = error {
            print("Value update failed for \(characteristic.uuid): \(error.localizedDescription)")
            return
        }
        guard let data = characteristic.value else { return }

        if characteristic.uuid == batteryLevel, let level = data.first {
            batteryPercent = level
            print("Battery: \(level)%")
        } else if characteristic.uuid == heartRateMeasurement {
            parseHeartRate(data)
        }
    }

    private func parseHeartRate(_ data: Data) {
        let bytes = [UInt8](data)
        guard bytes.count >= 2 else { return }

        let flags = bytes[0]
        var index = 1
        let bpm: UInt16
        if flags & 0x01 != 0 {
            guard bytes.count >= 3 else { return }
            bpm = UInt16(bytes[1]) | (UInt16(bytes[2]) << 8)
            index = 3
        } else {
            bpm = UInt16(bytes[1])
            index = 2
        }

        if flags & 0x08 != 0 { index += 2 }
        var rrMilliseconds: [Double] = []
        if flags & 0x10 != 0 {
            while index + 1 < bytes.count {
                let raw = UInt16(bytes[index]) | (UInt16(bytes[index + 1]) << 8)
                rrMilliseconds.append(Double(raw) * 1000.0 / 1024.0)
                index += 2
            }
        }

        let timestamp = ISO8601DateFormatter().string(from: Date())
        let rr = rrMilliseconds.map { String(format: "%.1f", $0) }.joined(separator: ",")
        print("\(timestamp) bpm=\(bpm) rr_ms=[\(rr)]")
        writeSnapshot(timestamp: timestamp, bpm: bpm, rrMilliseconds: rrMilliseconds)
    }

    private func writeSnapshot(timestamp: String, bpm: UInt16, rrMilliseconds: [Double]) {
        guard let jsonFile = jsonFile else { return }
        var snapshot: [String: Any] = [
            "timestamp": timestamp,
            "bpm": Int(bpm),
            "rrMs": rrMilliseconds.map { ($0 * 10).rounded() / 10 },
            "connected": true
        ]
        if let batteryPercent = batteryPercent {
            snapshot["batteryPercent"] = Int(batteryPercent)
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys])
            try data.write(to: jsonFile, options: .atomic)
        } catch {
            print("Could not write JSON snapshot: \(error.localizedDescription)")
        }
    }
}

let arguments = CommandLine.arguments.dropFirst()
let scanOnly = arguments.contains("--scan-only")
let secondsIndex = arguments.firstIndex(of: "--scan-seconds")
let scanSeconds: TimeInterval = secondsIndex.flatMap { index in
    let valueIndex = arguments.index(after: index)
    guard valueIndex < arguments.endIndex else { return nil }
    return TimeInterval(arguments[valueIndex])
} ?? 20
let jsonIndex = arguments.firstIndex(of: "--json-file")
let jsonFile: URL? = jsonIndex.flatMap { index in
    let valueIndex = arguments.index(after: index)
    guard valueIndex < arguments.endIndex else { return nil }
    return URL(fileURLWithPath: String(arguments[valueIndex]))
}

print(scanOnly ? "Mode: detection only" : "Mode: live heart-rate stream")
if let jsonFile = jsonFile { print("Publishing latest reading to \(jsonFile.path)") }
let client = H10Client(scanOnly: scanOnly, scanSeconds: scanSeconds, jsonFile: jsonFile)
RunLoop.main.run()
