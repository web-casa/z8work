## Using Docker

This file covers how to build and run Z8.Work in Docker.

- [Manually building the image](#manually-building-the-image)
- [Using an image from the GitHub Container Registry](#using-an-image-from-the-github-container-registry)

### Manually building the image

Run the following command from this project checkout:

```shell
docker build -t z8-work:local \
    --build-arg PUB_ENV=production \
    --build-arg PUB_HOSTNAME=z8.work \
    --build-arg PUB_PLAUSIBLE_URL=https://plausible.example.com \
    --build-arg PUB_VERTD_URL=https://vertd.vert.sh \
    --build-arg PUB_DISABLE_ALL_EXTERNAL_REQUESTS=true .
```

You can then run it by using:

```shell
docker run -d \
    --restart unless-stopped \
    -p 3000:80 \
    --name "vert" \
    z8-work:local
```

This will do the following:

- Use the previously built image as the container `vert`, in detached mode
- Continuously restart the container until manually stopped
- Map `3000/tcp` (host) to `80/tcp` (container)

We also have a [`docker-compose.yml`](/docker-compose.yml) file available. Use `docker compose up` if you want to start the stack, or `docker compose down` to bring it down. You can pass `--build` to `docker compose up` to rebuild the Docker image (useful if you've changed any of the environment variables) as well as `-d` to start it in detached mode. You can read more about Docker Compose in general [here](https://docs.docker.com/compose/intro/compose-application-model/).

### Using an image from the GitHub Container Registry

The repository's Docker workflow publishes to `ghcr.io/<owner>/<repository>`. Use the image produced by your own repository once it has been published. The upstream `ghcr.io/vert-sh/vert` image contains upstream VERT, not the Z8.Work changes in this checkout.

Public environment variables are compiled into the frontend at build time. Rebuild the image when changing them. The local Compose configuration uses `z8-work:local`; start it with `docker compose up --build -d`.
