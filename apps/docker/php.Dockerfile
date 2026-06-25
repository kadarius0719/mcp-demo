FROM php:8.4-cli

RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip libsqlite3-dev libicu-dev \
 && docker-php-ext-install pdo_sqlite intl > /dev/null \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY docker/php-entrypoint.sh /usr/local/bin/php-entrypoint.sh
RUN chmod +x /usr/local/bin/php-entrypoint.sh

ENV COMPOSER_ALLOW_SUPERUSER=1
WORKDIR /app
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/php-entrypoint.sh"]
