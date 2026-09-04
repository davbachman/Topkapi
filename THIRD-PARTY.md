# Third-party components

- **Taprats 1.1.12**, Craig S. Kaplan and contributors: original user-supplied binary, preserved unmodified. The original application and embedded attribution/resources remain in `public/taprats.jar`.
- **CheerpJ 4.3**, Leaning Technologies: fetched directly from its versioned CDN at runtime, not redistributed here. Community edition is for personal and non-business use. See https://cheerpj.com/docs/licensing for terms and commercial licensing. The runtime's notices remain visible.
- **Apache Batik 1.19**, **Apache XML Graphics Commons 2.11**, **Commons IO 2.17.0**, **Commons Logging 1.3.0**, and **XML APIs Extensions 1.3.04**: bundled from Maven Central to support the original SVG export plugin. Their embedded licenses/notices are preserved inside each JAR and extracted in `public/licenses/`.
- **Eclipse compiler 3.26.0**: optional build tool downloaded from Maven Central by `scripts/build-java.sh`, verified by SHA-256, and not part of the delivered web runtime.
- JavaScript packages and versions are recorded in `package-lock.json` and retain their package licensing information.
