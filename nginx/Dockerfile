# syntax=docker/dockerfile:1.12

ARG NGINX_IMAGE=nginx:1.31.3-alpine3.24-slim

FROM ${NGINX_IMAGE}

COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY rustfs-upload-location.conf /etc/nginx/rustfs-upload-location.conf

RUN chown nginx:nginx /var/cache/nginx

USER nginx:nginx

EXPOSE 1235 8443
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:1235/health"]

CMD ["nginx", "-g", "daemon off;"]
