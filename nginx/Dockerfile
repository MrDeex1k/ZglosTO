FROM nginx:1.29.4-alpine

# Kopia konfiguracji nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx będzie proxy dla frontendu i backendu
EXPOSE 1235

CMD ["nginx", "-g", "daemon off;"]