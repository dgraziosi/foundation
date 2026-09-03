FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/usr/lib/postgresql/16/bin:/usr/local/bin:${PATH}"

RUN printf '%s\n' '#!/bin/sh' 'exit 101' > /usr/sbin/policy-rc.d \
    && chmod 0755 /usr/sbin/policy-rc.d \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        postgresql-16 \
        postgresql-16-pgvector \
        python3 \
        sudo \
        xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && pg_ctlcluster 16 main stop || true

# Node 22 official linux-x64 tarball (nodejs.org). pnpm via corepack, same pin as packageManager.
ARG NODE_VERSION=22.22.2
RUN curl -fsSLo /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && corepack enable \
    && corepack prepare pnpm@10.33.3 --activate

RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu
