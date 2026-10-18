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
    cat <<'EOF' > "$INSTALL_DIR/server.cjs"
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

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

backup_app() {
    print_banner
    echo "[+] Creating backup of application data and configuration..."
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    if [ -d "$INSTALL_DIR" ]; then
        tar --exclude="node_modules" --exclude=".git" -czf "$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz" -C "$INSTALL_DIR" .
        echo "[v] Backup successfully created at:"
        echo "$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz"
    else
        echo "[!] Installation directory not found."
    fi
}

update_app() {
    print_banner
    echo "[+] Updating Arka software..."
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR" || exit 1
        if command -v git &> /dev/null && [ -d ".git" ]; then
            git fetch --all && git reset --hard origin/main
        fi
        create_server_script
        docker compose restart 2>/dev/null || docker-compose restart 2>/dev/null || systemctl restart arka-restaurant 2>/dev/null || true
        echo "[v] Update completed successfully."
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
        echo "2) Create Backup"
        echo "3) Update System"
        echo "4) Uninstall / Remove"
        echo "0) Exit"
        echo "================================================================"
        read -p "[-] Select an option (0-4): " CHOICE

        case "$CHOICE" in
            1)
                install_app
                read -p "[-] Press Enter to return to menu..."
                ;;
            2)
                backup_app
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
            0)
                echo "Exiting. Goodbye!"
                exit 0
                ;;
            *)
                echo "Invalid option. Please enter a number between 0 and 4."
                sleep 2
                ;;
        esac
    done
}

main_menu
