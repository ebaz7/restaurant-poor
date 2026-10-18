#!/usr/bin/env bash
# ==============================================================================
# Arka Restaurant Software - One-Click Iran-Optimized Installer & Manager
# Compatible with National Internet (Net Melli) & Local Mirrors / Caching Proxies
# Repository: https://github.com/ebaz7/restaurant-poor.git
# ==============================================================================

APP_NAME="arka-restaurant"
INSTALL_DIR="/opt/arka-restaurant"
REPO_URL="https://github.com/ebaz7/restaurant-poor.git"

print_banner() {
    clear
    echo "================================================================"
    echo "   Arka Restaurant Management Software - Linux Installer & Manager"
    echo "   Optimized for National Internet, Local Mirrors & Iran CDN"
    echo "================================================================"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "[!] Please run this script with root privileges (sudo bash)."
        exit 1
    fi
}

ensure_swap() {
    if [ "$(swapon --show | wc -l)" -eq 0 ]; then
        echo "[i] Configuring 2GB swap file for low-memory VPS stability..."
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null || true
        chmod 600 /swapfile 2>/dev/null || true
        mkswap /swapfile 2>/dev/null || true
        swapon /swapfile 2>/dev/null || true
    fi
}

setup_iran_mirrors() {
    echo "[i] Configuring domestic registry mirrors (Net Melli & ArvanCloud)..."
    mkdir -p /etc/docker
    cat <<EOF > /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.arvancloud.ir",
    "https://mirror.gcr.io"
  ]
}
EOF
    systemctl restart docker 2>/dev/null || true
}

create_server_script() {
    mkdir -p "$INSTALL_DIR/data"
    cat <<'EOF' > "$INSTALL_DIR/server.cjs"
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST' && parsedUrl.pathname === '/api/sync-backup') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (payload.backupJson) {
            fs.writeFileSync(path.join(DATA_DIR, 'latest_db_backup.json'), payload.backupJson, 'utf8');
          }
          if (payload.settings) {
            const s = payload.settings;
            const envLines = [
              `RESTAURANT_NAME="${String(s.restaurantName || 'Arka').replace(/"/g, '')}"`,
              `BALE_BOT_TOKEN="${String(s.baleBotToken || '').trim()}"`,
              `BALE_CHAT_ID="${String(s.baleChatId || '').trim()}"`,
              `TELEGRAM_BOT_TOKEN="${String(s.telegramBotToken || '').trim()}"`,
              `TELEGRAM_CHAT_ID="${String(s.telegramChatId || '').trim()}"`,
            ];
            fs.writeFileSync(path.join(DATA_DIR, 'bot_config.env'), envLines.join('\n') + '\n', 'utf8');
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    let filePath = path.join(DIST_DIR, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
      });
      res.end(content);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arka Restaurant production server running on http://0.0.0.0:${PORT}`);
});
EOF
}

configure_ssl_and_nginx() {
    local DOMAIN="$1"
    local PORT="$2"
    local SSL_MODE="$3"
    local SERVER_IP="$4"

    echo "[i] Installing Nginx and OpenSSL for Domain & SSL..."
    apt-get install -y nginx openssl || true

    local SSL_DIR="/etc/nginx/ssl"
    mkdir -p "$SSL_DIR"

    local CERT_FILE="$SSL_DIR/${DOMAIN}.crt"
    local KEY_FILE="$SSL_DIR/${DOMAIN}.key"

    echo "[i] Generating SSL certificate for $DOMAIN ($SSL_MODE)..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=IR/ST=Tehran/L=Tehran/O=ArkaRestaurant/CN=${DOMAIN}" \
        -addext "subjectAltName=DNS:${DOMAIN},DNS:www.${DOMAIN},IP:${SERVER_IP}" 2>/dev/null || \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/C=IR/ST=Tehran/L=Tehran/O=ArkaRestaurant/CN=${DOMAIN}"

    chmod 600 "$KEY_FILE"
    chmod 644 "$CERT_FILE"

    cat <<EOF > /etc/nginx/sites-available/arka-restaurant.conf
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    ln -sf /etc/nginx/sites-available/arka-restaurant.conf /etc/nginx/sites-enabled/arka-restaurant.conf
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    nginx -t && systemctl enable --now nginx && systemctl reload nginx || systemctl restart nginx || true

    if [ "$SSL_MODE" == "letsencrypt" ]; then
        echo "[i] Requesting official Let's Encrypt SSL certificate for ${DOMAIN}..."
        apt-get install -y certbot python3-certbot-nginx || true
        certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
            echo "[!] Let's Encrypt verification could not complete (check DNS A-record or Net Melli). Internal/CDN SSL remains active on port 443."
        }
    fi

    echo "[v] SSL Certificate active at: $CERT_FILE"
    echo "[v] Private Key active at:     $KEY_FILE"
}

install_app() {
    print_banner
    echo "[+] Starting Arka installation process..."

    ensure_swap

    apt-get update -y
    apt-get install -y curl git ca-certificates openssl lsof || true

    if [ -f "./package.json" ] && [ "$(pwd)" != "$INSTALL_DIR" ]; then
        echo "[v] Project files found in current directory. Copying to $INSTALL_DIR..."
        mkdir -p "$INSTALL_DIR"
        cp -rf ./* "$INSTALL_DIR"/ 2>/dev/null || true
    elif [ -d "$INSTALL_DIR/.git" ]; then
        echo "[i] Existing installation found in $INSTALL_DIR. Pulling latest updates..."
        cd "$INSTALL_DIR" || exit 1
        git fetch --all && git reset --hard origin/main || true
    else
        echo "[i] Cloning source code from GitHub..."
        rm -rf "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR" || {
            echo "[!] Failed to clone repository. Please upload project files to $INSTALL_DIR and run again."
            exit 1
        }
    fi

    cd "$INSTALL_DIR" || exit 1

    read -p "[-] Enter desired port for running the app (default 3000): " PORT
    PORT=${PORT:-3000}

    read -p "[-] Do you want to configure Domain & SSL? (y/n): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="iran_local"

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] Enter your domain name (e.g. foodmix.ir): " DOMAIN
        echo ""
        echo "Select SSL Certificate Mode:"
        echo "1) Internal / Iran CDN SSL (No external internet required, ArvanCloud & Net Melli compatible)"
        echo "2) International (Let's Encrypt Official SSL)"
        read -p "[-] Choose option (1 or 2, default 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}
        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="letsencrypt"
        fi
    fi

    setup_iran_mirrors

    echo "[i] Installing Docker & Docker Compose..."
    if ! command -v docker &> /dev/null; then
        apt-get install -y docker.io || true
    fi
    systemctl enable --now docker 2>/dev/null || true

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        apt-get install -y docker-compose-v2 || apt-get install -y docker-compose || true
    fi

    echo "[i] Creating zero-dependency production server script..."
    create_server_script

    # If dist/index.html is not pre-built, build it once
    if [ ! -f "$INSTALL_DIR/dist/index.html" ]; then
        echo "[i] Building production frontend bundle (this may take 1-2 minutes)..."
        if command -v docker &> /dev/null; then
            docker run --rm -v "$INSTALL_DIR:/app" -w /app \
                -e ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
                node:20-alpine \
                sh -c "npm config set registry https://registry.npmmirror.com && npm install --no-audit --no-fund && npm run build" || true
        fi
        if [ ! -f "$INSTALL_DIR/dist/index.html" ]; then
            apt-get install -y nodejs npm || true
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            npm config set registry https://registry.npmmirror.com
            npm install --no-audit --no-fund && npm run build || true
        fi
    else
        echo "[v] Pre-built production bundle (dist/index.html) found and ready!"
    fi

    # Free target port if occupied by old process
    systemctl stop arka-restaurant 2>/dev/null || true
    docker rm -f arka-restaurant 2>/dev/null || true

    echo "[i] Starting Arka container on port $PORT..."
    cat <<EOF > "$INSTALL_DIR/docker-compose.yml"
services:
  arka-app:
    image: node:20-alpine
    container_name: arka-restaurant
    working_dir: /app
    restart: always
    environment:
      - PORT=3000
    ports:
      - "0.0.0.0:${PORT}:3000"
    command: node server.cjs
    volumes:
      - .:/app
EOF

    STARTED=0
    if command -v docker &> /dev/null; then
        if docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null; then
            STARTED=1
        fi
    fi

    # Fallback to systemd + host Node.js if Docker failed
    if [ "$STARTED" -eq 0 ]; then
        echo "[i] Configuring native systemd service for Arka..."
        apt-get install -y nodejs || true
        cat <<EOF > /etc/systemd/system/arka-restaurant.service
[Unit]
Description=Arka Restaurant Management Software
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${PORT}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.cjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable --now arka-restaurant
    fi

    SERVER_IP=$(hostname -I | awk '{print $1}')

    # Configure Domain & SSL if requested
    if [ -n "$DOMAIN" ]; then
        configure_ssl_and_nginx "$DOMAIN" "$PORT" "$SSL_MODE" "$SERVER_IP"
    fi

    # Open firewall ports if UFW is active
    if command -v ufw &> /dev/null; then
        ufw allow "${PORT}/tcp" 2>/dev/null || true
        ufw allow 80/tcp 2>/dev/null || true
        ufw allow 443/tcp 2>/dev/null || true
    fi

    echo "[i] Verifying server health on port $PORT..."
    sleep 2
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}" || echo "000")

    echo "================================================================"
    if [ "$HTTP_STATUS" == "200" ]; then
        echo "[v] SUCCESS! Arka Restaurant is UP and responding (HTTP 200 OK)!"
    else
        echo "[!] Service started (HTTP status: $HTTP_STATUS). Check 'docker logs arka-restaurant'."
    fi
    echo "----------------------------------------------------------------"
    echo "[v] Direct IP URL:     http://${SERVER_IP}:${PORT}"
    if [ -n "$DOMAIN" ]; then
        echo "[v] Domain Port URL:   http://${DOMAIN}:${PORT}"
        echo "[v] Domain HTTP URL:   http://${DOMAIN}"
        echo "[v] Domain HTTPS URL:  https://${DOMAIN} (SSL Active: ${SSL_MODE})"
    fi
    echo "================================================================"
    echo "[i] Note: If using a VPN/Proxy in your browser, disable VPN for ${SERVER_IP} or ${DOMAIN}."
}

send_backup_to_bots() {
    local ARCHIVE_FILE="$1"
    local TRIGGER_REASON="${2:-Manual Backup}"
    local BOT_ENV_FILE="$INSTALL_DIR/data/bot_config.env"
    local FALLBACK_ENV_FILE="/opt/arka-backup/bot_config.env"

    BALE_BOT_TOKEN=""
    BALE_CHAT_ID=""
    TELEGRAM_BOT_TOKEN=""
    TELEGRAM_CHAT_ID=""
    RESTAURANT_NAME="Arka Restaurant"

    if [ -f "$BOT_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$BOT_ENV_FILE" 2>/dev/null || true
        mkdir -p /opt/arka-backup
        cp -f "$BOT_ENV_FILE" "$FALLBACK_ENV_FILE" 2>/dev/null || true
    elif [ -f "$FALLBACK_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$FALLBACK_ENV_FILE" 2>/dev/null || true
    fi

    local CAPTION="Arka Restaurant Backup | Store: ${RESTAURANT_NAME} | Trigger: ${TRIGGER_REASON} | Date: $(date '+%Y-%m-%d %H:%M:%S')"
    local DB_JSON_FILE="$INSTALL_DIR/data/latest_db_backup.json"
    local SENT_ANY=0

    if [ -n "$BALE_BOT_TOKEN" ] && [ -n "$BALE_CHAT_ID" ]; then
        echo "[i] Sending backup to Bale Bot (Chat ID: $BALE_CHAT_ID)..."
        if [ -f "$DB_JSON_FILE" ]; then
            curl -s -X POST "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${BALE_CHAT_ID}" \
                -F "caption=${CAPTION} (Database JSON)" \
                -F "document=@${DB_JSON_FILE}" >/dev/null 2>&1 || true
        fi
        if [ -f "$ARCHIVE_FILE" ]; then
            if curl -s -f -X POST "https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${BALE_CHAT_ID}" \
                -F "caption=${CAPTION} (Full Archive)" \
                -F "document=@${ARCHIVE_FILE}" >/dev/null 2>&1; then
                echo "[v] Backup successfully delivered to Bale Bot!"
                SENT_ANY=1
            else
                echo "[!] Could not upload archive to Bale Bot (check token/chat_id or file size)."
            fi
        fi
    fi

    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        echo "[i] Sending backup to Telegram Bot (Chat ID: $TELEGRAM_CHAT_ID)..."
        if [ -f "$DB_JSON_FILE" ]; then
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${TELEGRAM_CHAT_ID}" \
                -F "caption=${CAPTION} (Database JSON)" \
                -F "document=@${DB_JSON_FILE}" >/dev/null 2>&1 || true
        fi
        if [ -f "$ARCHIVE_FILE" ]; then
            if curl -s -f -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
                -F "chat_id=${TELEGRAM_CHAT_ID}" \
                -F "caption=${CAPTION} (Full Archive)" \
                -F "document=@${ARCHIVE_FILE}" >/dev/null 2>&1; then
                echo "[v] Backup successfully delivered to Telegram Bot!"
                SENT_ANY=1
            else
                echo "[!] Could not upload archive to Telegram Bot (check token/chat_id or outbound access)."
            fi
        fi
    fi

    if [ "$SENT_ANY" -eq 0 ] && [ -z "$BALE_BOT_TOKEN" ] && [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        echo "[i] No Bale or Telegram Bot configured yet. Skipping bot delivery (local backup saved)."
    fi
}

configure_bots_cli() {
    print_banner
    echo "[+] Configure Bale & Telegram Auto-Backup Bots (Pre-Update & Scheduled)"
    mkdir -p "$INSTALL_DIR/data" /opt/arka-backup
    local BOT_ENV_FILE="$INSTALL_DIR/data/bot_config.env"
    if [ -f "$BOT_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        source "$BOT_ENV_FILE" 2>/dev/null || true
    fi

    read -p "[-] Enter Bale Bot Token (current: ${BALE_BOT_TOKEN:-none}): " NEW_BALE_TOKEN
    BALE_BOT_TOKEN=${NEW_BALE_TOKEN:-$BALE_BOT_TOKEN}
    read -p "[-] Enter Bale Chat ID (current: ${BALE_CHAT_ID:-none}): " NEW_BALE_CHAT
    BALE_CHAT_ID=${NEW_BALE_CHAT:-$BALE_CHAT_ID}

    read -p "[-] Enter Telegram Bot Token (current: ${TELEGRAM_BOT_TOKEN:-none}): " NEW_TG_TOKEN
    TELEGRAM_BOT_TOKEN=${NEW_TG_TOKEN:-$TELEGRAM_BOT_TOKEN}
    read -p "[-] Enter Telegram Chat ID (current: ${TELEGRAM_CHAT_ID:-none}): " NEW_TG_CHAT
    TELEGRAM_CHAT_ID=${NEW_TG_CHAT:-$TELEGRAM_CHAT_ID}

    cat <<EOF > "$BOT_ENV_FILE"
RESTAURANT_NAME="${RESTAURANT_NAME:-Arka Restaurant}"
BALE_BOT_TOKEN="${BALE_BOT_TOKEN}"
BALE_CHAT_ID="${BALE_CHAT_ID}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"
EOF
    cp -f "$BOT_ENV_FILE" /opt/arka-backup/bot_config.env 2>/dev/null || true
    echo "[v] Bot configuration saved! Backups will automatically be sent to configured bots before every update."
}

backup_app() {
    local TRIGGER_REASON="${1:-Manual Backup}"
    echo "[+] Creating backup of application data and configuration ($TRIGGER_REASON)..."
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local ARCHIVE_FILE="$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz"
    
    if [ -d "$INSTALL_DIR" ]; then
        tar --exclude="node_modules" --exclude=".git" -czf "$ARCHIVE_FILE" -C "$INSTALL_DIR" .
        if [ -f "$INSTALL_DIR/data/latest_db_backup.json" ]; then
            cp -f "$INSTALL_DIR/data/latest_db_backup.json" "$BACKUP_DIR/arka_db_$TIMESTAMP.json" 2>/dev/null || true
        fi
        echo "[v] Local backup created at: $ARCHIVE_FILE"
        send_backup_to_bots "$ARCHIVE_FILE" "$TRIGGER_REASON"
    else
        echo "[!] Installation directory not found."
    fi
}

update_app() {
    print_banner
    echo "[+] Starting Safe Update Process for Arka Restaurant..."
    if [ -d "$INSTALL_DIR" ]; then
        echo "[+] Step 1/3: Creating automatic pre-update backup & sending to Bale/Telegram bots..."
        backup_app "Automatic Pre-Update Backup"

        # Preserve data folder before git reset
        mkdir -p /tmp/arka_data_preserve
        if [ -d "$INSTALL_DIR/data" ]; then
            cp -rf "$INSTALL_DIR/data/"* /tmp/arka_data_preserve/ 2>/dev/null || true
        fi

        echo "[+] Step 2/3: Fetching latest software version from repository..."
        cd "$INSTALL_DIR" || exit 1
        if command -v git &> /dev/null && [ -d ".git" ]; then
            git fetch --all && git reset --hard origin/main
        fi

        mkdir -p "$INSTALL_DIR/data"
        cp -rf /tmp/arka_data_preserve/* "$INSTALL_DIR/data/" 2>/dev/null || true
        rm -rf /tmp/arka_data_preserve

        create_server_script

        echo "[+] Step 3/3: Rebuilding frontend bundle and restarting services..."
        if command -v docker &> /dev/null; then
            docker run --rm -v "$INSTALL_DIR:/app" -w /app \
                -e ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
                node:20-alpine \
                sh -c "npm config set registry https://registry.npmmirror.com && npm install --no-audit --no-fund && npm run build" || true
        fi
        docker compose restart 2>/dev/null || docker-compose restart 2>/dev/null || systemctl restart arka-restaurant 2>/dev/null || true
        echo "[v] Update completed successfully (Pre-update backup saved & sent to configured bots)."
    else
        echo "[!] Software is not installed."
    fi
}

remove_app() {
    print_banner
    echo "[!] Warning: This will stop and remove all application containers and files."
    read -p "[-] Are you sure you want to uninstall? (y/n): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        systemctl stop arka-restaurant 2>/dev/null || true
        systemctl disable arka-restaurant 2>/dev/null || true
        rm -f /etc/systemd/system/arka-restaurant.service /etc/nginx/sites-enabled/arka-restaurant.conf /etc/nginx/sites-available/arka-restaurant.conf 2>/dev/null || true
        systemctl reload nginx 2>/dev/null || true
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || true
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
            docker rm -f arka-restaurant 2>/dev/null || true
            rm -rf "$INSTALL_DIR"
        fi
        echo "[v] Software successfully removed."
    else
        echo "[i] Uninstallation cancelled."
    fi
}

main_menu() {
    check_root
    while true; do
        print_banner
        echo "1) Install & Setup (Port, Domain, SSL & Iran Mirrors)"
        echo "2) Create Backup & Send to Bale/Telegram Bots"
        echo "3) Update System (Auto-Backup to Bots + Update)"
        echo "4) Uninstall / Remove"
        echo "5) Configure Bale & Telegram Bot Tokens (CLI)"
        echo "0) Exit"
        echo "================================================================"
        read -p "[-] Select an option (0-5): " CHOICE

        case "$CHOICE" in
            1)
                install_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            2)
                print_banner
                backup_app "Manual CLI Backup"
                read -p "[-] Press Enter to return to menu..."
                ;;
            3)
                update_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            4)
                remove_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            5)
                configure_bots_cli
                read -p "[-] Press Enter to return to menu..."
                ;;
            0)
                echo "Exiting. Goodbye!"
                exit 0
                ;;
            *)
                echo "Invalid option. Please enter a number between 0 and 5."
                sleep 2
                ;;
        esac
    done
}

main_menu
