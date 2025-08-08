# Use a tiny, production-grade web server
FROM nginx:1.27-alpine

# Copy our Nginx vhost configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the static site
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY bdf.js /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

EXPOSE 80
