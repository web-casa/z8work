## FAQ

This file covers frequently asked questions.

- [Why VERT?](#why-vert)
- [What happens with video files?](#what-happens-with-video-files)
- [Can I host my own video file converter?](#can-i-host-my-own-video-file-converter)
- [What about analytics?](#what-about-analytics)
- [What libraries does VERT use?](#what-libraries-does-vert-use)
- [Is it possible to fully prevent VERT from making requests to external services?](#is-it-possible-to-fully-prevent-vert-from-making-requests-to-external-services)

### Why VERT?

**File converters have always disappointed us.** They're ugly, riddled with ads, and most importantly; slow. We decided to solve this problem once and for all by making an alternative that solves all those problems, and more.

The active converters process files on-device. The files selected for conversion are not uploaded.

### What happens with video files?

This fork supports local audio extraction from video using FFmpeg. A remote video converter is not registered, so this version does not upload video files to VERT's servers or offer general video-to-video conversion.

### Can I host my own video file converter?

The upstream [Video Conversion](./VIDEO_CONVERSION.md) guide describes vertd. Enabling it in this fork would require explicitly integrating a remote converter and updating the local-processing disclosures; setting a server URL alone does not enable it.

### What about analytics?

This version does not load Google Analytics or send conversion telemetry. Website hosting still involves network connections, and host logs depend on the deployment. See the application's privacy page for its current disclosures.

### Is it possible to fully prevent VERT from making requests to external services?

Set `PUB_DISABLE_ALL_EXTERNAL_REQUESTS` to `true` **during build time** to disable automatic requests to external services, including GitHub contributor information.

All conversion engines, including FFmpeg, are served by the deployment itself. With this option, the app does not automatically request third-party services. Audio and video-to-audio conversion remain available. This setting does not block external links opened by the user, server-side hosting logs, or package downloads during installation and builds.

### What libraries does VERT use?

This fork uses FFmpeg for audio and video-to-audio conversion, ImageMagick for images, Pandoc for documents, and MuPDF for rendering PDF pages.
