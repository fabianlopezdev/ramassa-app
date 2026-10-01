# Dependency review, 2026-10-01

RAPP-125 covers the SDK 58 upgrade and commit verification repairs. The audit found newly reported transitive vulnerabilities and an expired image-size exception.

Updated overrides to the fixed registry releases: @xmldom/xmldom 0.9.12, baseline-browser-mapping 2.11.27, brace-expansion 5.0.12, browserslist 4.29.3, decode-uri-component 0.5.0, fast-uri 3.1.8, hono 4.13.12, ip-address 10.7.2, js-yaml 4.3.2, moment 2.31.0, qs 6.16.0, sharp 0.35.5, and undici 7.29.1.

Pinned the Metro configuration peer to the same release as React Native (0.88.0-rc.3). A targeted recursive update removed the stale 0.86 configuration and Metro 0.84.4 graph, including image-size. SDK package versions remain explicitly controlled by the mobile manifest.

The old image-size exception and patch are retired. The audit gate requires an empty JSON report and successful audit exit status. It never accepts an advisory based on package name, age, or build-time exposure. Regression tests cover clean reports, the retired exception, new packages, and malformed output.

Evidence: npm registry package manifests and `bun audit --json` against the final resolved lockfile. The report is empty as of this review. Historical image-size advisories: [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [JXL](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
