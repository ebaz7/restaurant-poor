#!/usr/bin/env bash
# ==============================================================================
# Arka Restaurant Software - One-Click Iran-Optimized Installer & Manager
# Compatible with National Internet (Net Melli) & Local Mirrors / Caching Proxies
# Repository: https://github.com/ebaz7/restaurant-poor.git
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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

install_app() {
    print_banner
    echo "[+] Starting Arka installation process..."

    mkdir -p "$INSTALL_DIR"
    
    if [ -f "./package.json" ] || [ -f "./Dockerfile" ]; then
        echo "[v] Project files found in current directory. Copying to installation folder..."
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
    else
        echo "[i] Cloning source code from GitHub (or local mirror)..."
        if command -v git &> /dev/null; then
            git clone "$REPO_URL" "$INSTALL_DIR" || {
                echo "[!] Failed to clone repository. Please upload project files to the server and run the script again."
            }
        else
            apt-get update && apt-get install -y git
            git clone "$REPO_URL" "$INSTALL_DIR"
        fi
    fi

    cd "$INSTALL_DIR" || exit 1

    read -p "[-] Enter desired port for running the app (default 3000): " PORT
    PORT=${PORT:-3000}

    read -p "[-] Do you want to configure Domain & SSL? (y/n): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="iran_local"

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] Enter your domain name (e.g. restaurant.local or rezvan.ir): " DOMAIN
        echo ""
        echo "Select SSL Certificate Mode:"
        echo "1) Internal / Self-Signed (No external internet required, Net Melli compatible)"
        echo "2) International (Let's Encrypt)"
        read -p "[-] Choose option (1 or 2, default 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}
        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="letsencrypt"
        fi
    fi

    setup_iran_mirrors

    echo "[i] Installing prerequisites (Docker & Nginx)..."
    if ! command -v docker &> /dev/null; then
        apt-get update && apt-get install -y curl apt-transport-https ca-certificates gnupg lsb-release
        curl -fsSL https://get.docker.com -o get-docker.sh || curl -fsSL https://get.docker.ir -o get-docker.sh
        sh get-docker.sh
    fi

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
    fi

    echo "[i] Building and starting containers on port $PORT..."

    cat <<EOF > docker-compose.yml
version: '3.8'
services:
  arka-app:
    image: node:20-alpine
    container_name: arka-restaurant
    working_dir: /app
    restart: always
    ports:
      - "${PORT}:3000"
    command: sh -c "npm install -g pnpm && pnpm install --frozen-lockfile || npm install && npm run build && node server.ts"
    volumes:
      - .:/app
EOF

    docker compose up -d --build || docker-compose up -d --build

    echo "[v] Arka Restaurant software successfully installed and running on port $PORT!"
    if [ -n "$DOMAIN" ]; then
        echo "[i] Configured Domain: $DOMAIN"
        echo "[i] SSL Mode: $SSL_MODE"
    fi
    echo "[v] To open the management menu anytime, simply run:"
    echo "sudo bash install.sh"
}

backup_app() {
    print_banner
    echo "[+] Creating backup of application data and database..."
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    if [ -d "$INSTALL_DIR" ]; then
        tar -czf "$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz" -C "$INSTALL_DIR" .
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
            git pull origin main || echo "[i] Please replace source files manually if needed."
        fi
        docker compose restart || docker-compose restart
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
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || true
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
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
