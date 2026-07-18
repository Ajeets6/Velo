For this product, I’d ship a desktop application with the UI, backend, and MotionForge executable bundled together—but keep the AI model external/configurable.

Recommended distribution:

```text
Desktop app
├── React UI
├── Local Node backend
├── MotionForge executable
└── Configuration
      ├── Ollama
      └── Cloud API provider
```

Use Tauri as the desktop shell. It produces smaller, more native applications than Electron and can launch the Node/backend and MotionForge sidecars. Electron is easier if you want everything to remain JavaScript, but its installer and memory usage are larger.

The installer should include:

- Compiled React UI
- Local backend
- MotionForge executable and required rendering resources
- FFmpeg if MotionForge needs it
- Default configuration
- Windows installer and uninstall support

Do not bundle an LLM initially. Models make installers extremely large, increase hardware requirements, and complicate updates and licensing. Let users connect to an existing Ollama installation or a cloud provider.

Model selection

Yes, but keep it under Settings—not in the main tutor interface.

Provide:

- Provider: Local Ollama / Cloud
- Ollama URL
- Model selector populated from `/api/tags`
- Connection test
- Recommended-model label
- Performance estimate such as Fast, Balanced, or High quality
- Separate model selection for tutor chat and animation scene generation, if necessary

Avoid exposing raw model names to less technical users on first launch. A simple choice like “On-device” versus “Cloud” is friendlier, with advanced settings available later.

API keys

Allow API keys in Settings, but never place them in ordinary page fields or save them in browser storage.

For a desktop application:

- Store keys in Windows Credential Manager, macOS Keychain, or Linux Secret Service.
- Let the local backend retrieve the key when needed.
- Mask saved keys and provide Replace/Delete actions.
- Never include keys in logs, URLs, frontend state, configuration files, or crash reports.

For a hosted web application, users generally should not provide API keys. Your server should own the provider credentials, enforce quotas, and authenticate users. Bring-your-own-key can be offered as an advanced option, but it creates security and support complexity.

Suggested first-run flow:

1. Welcome
2. Choose On-device or Cloud
3. Detect Ollama automatically
4. Recommend an installed model
5. Run a connection test
6. Open the tutor

Best initial distribution strategy:

- Windows-first desktop app with Tauri
- Bundle MotionForge as a sidecar executable
- Detect the user’s existing Ollama service
- Use one recommended Ollama model by default
- Add advanced model selection in Settings
- Add optional cloud-provider keys stored in the OS credential vault
- Keep the learning screen free of infrastructure settings

One caution: validate whether Manim, FFmpeg, LaTeX, fonts, and other runtime resources are genuinely included in the MotionForge executable. A single `.exe` can still fail on clean machines if those external tools or data files are missing. Test the installer on a fresh Windows VM before distribution.