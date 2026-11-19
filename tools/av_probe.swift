import AVFoundation
import CoreMedia

func authName(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}

func fourCC(_ value: FourCharCode) -> String {
    let bytes: [UInt8] = [
        UInt8((value >> 24) & 0xff), UInt8((value >> 16) & 0xff),
        UInt8((value >> 8) & 0xff), UInt8(value & 0xff)
    ]
    return String(bytes: bytes, encoding: .ascii) ?? String(value)
}

print("cameraAuthorization=\(authName(AVCaptureDevice.authorizationStatus(for: .video)))")
print("microphoneAuthorization=\(authName(AVCaptureDevice.authorizationStatus(for: .audio)))")

for mediaType in [AVMediaType.video, AVMediaType.audio] {
    let devices = AVCaptureDevice.devices(for: mediaType)
    print("\n[\(mediaType.rawValue)] count=\(devices.count)")
    for device in devices {
        print("device=\(device.localizedName)")
        print("  uniqueID=REDACTED")
        print("  connected=\(device.isConnected) suspended=\(device.isSuspended)")
        print("  transportType=\(fourCC(FourCharCode(bitPattern: device.transportType)))")
        if mediaType == .video {
            print("  focusContinuous=\(device.isFocusModeSupported(.continuousAutoFocus))")
            print("  exposureContinuous=\(device.isExposureModeSupported(.continuousAutoExposure))")
            print("  whiteBalanceContinuous=\(device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance))")
            print("  torch=\(device.hasTorch) flash=\(device.hasFlash)")
        }
        print("  formats=\(device.formats.count)")
        for format in device.formats {
            let description = format.formatDescription
            let subtype = fourCC(CMFormatDescriptionGetMediaSubType(description))
            if mediaType == .video {
                let dimensions = CMVideoFormatDescriptionGetDimensions(description)
                let rates = format.videoSupportedFrameRateRanges.map {
                    String(format: "%.2f-%.2f fps", $0.minFrameRate, $0.maxFrameRate)
                }.joined(separator: ", ")
                print("    \(dimensions.width)x\(dimensions.height) \(subtype) [\(rates)]")
            } else if let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(description)?.pointee {
                print("    \(Int(asbd.mSampleRate)) Hz, \(asbd.mChannelsPerFrame) ch, \(fourCC(asbd.mFormatID))")
            } else {
                print("    audio subtype=\(subtype)")
            }
        }
    }
}
