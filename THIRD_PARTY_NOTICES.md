# Third-party components

The repository's MIT license applies to project code, not to third-party dependencies or downloaded model assets.

- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision` 0.10.32), Google: Apache License 2.0. Runtime/WASM files are copied from the installed package. See the package's included notices and [MediaPipe license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
- **MediaPipe Pose Landmarker Lite float16 model**, version 1, Google: downloaded from Google's MediaPipe model storage. See the [official model documentation and licensing](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) when redistributing. The model is not committed as project-authored code.
- **Undici**: MIT license. Used by the asset installer to support HTTPS downloads through environment-configured proxies.
- **Vite**: MIT license. See its installed package license.
- **Playwright**: Apache License 2.0. Development/test dependency.
- **DM Sans / Space Grotesk**: optional fonts loaded via Google Fonts under the SIL Open Font License. System fonts are used if unavailable.

`package-lock.json` records exact installed dependency versions. Preserve the relevant upstream licenses and notices when distributing bundled third-party components.
