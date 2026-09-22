FROM debian@sha256:f37a335e82bca302e955fa39f9dfe28f1be618f016f8a2b56318e5a5111afc26

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        alex=3.2.7.1-3 \
        build-essential=12.9 \
        ca-certificates=20250419~deb12u1 \
        curl=7.88.1-10+deb12u15 \
        happy=1.20.0-1 \
        libgmp-dev=2:6.2.1+dfsg1-1.1 \
        pkg-config=1.8.1-1 \
        unzip=6.0-28+deb12u1 \
        xz-utils=5.4.1-1+deb12u2 \
        zlib1g-dev=1:1.2.13.dfsg-1 \
    && rm -rf /var/lib/apt/lists/*
