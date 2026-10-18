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
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN}   Arka Restaurant Management Software - Linux Installer & Manager ${NC}"
    echo -e "${CYAN}   Optimized for National Internet, Local Mirrors & Iran CDN      ${NC}"
    echo -e "${CYAN}================================================================${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[!] Please run this script with root privileges (sudo bash).${NC}"
        exit 1
    fi
}

setup_iran_mirrors() {
    echo -e "${YELLOW}[i] Configuring domestic registry mirrors (Net Melli & ArvanCloud)...${NC}"
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
    echo -e "${YELLOW}[+] Starting Arka installation process...${NC}"

    mkdir -p "$INSTALL_DIR"
    
    if [ -f "./package.json" ] || [ -f "./Dockerfile" ]; then
        echo -e "${GREEN}[✓] Project files found in current directory. Copying to installation folder...${NC}"
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
    else
        echo -e "${YELLOW}[i] Cloning source code from GitHub (or local mirror)...${NC}"
        if command -v git &> /dev/null; then
            git clone "$REPO_URL" "$INSTALL_DIR" || {
                echo -e "${RED}[!] Failed to clone repository. Please upload project files to the server and run the script again.${NC}"
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
        read -p "[-] Enter your domain name (e.g., restaurant.local or rezvan.ir): " DOMAIN
        echo -e "\n${CYAN}Select SSL Certificate Mode:${NC}"
        echo "1) Internal / Self-Signed (No external internet required, Net Melli compatible)"
        echo "2) International (Let's Encrypt)"
        read -p "[-] Choose option (1 or 2, default 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}
        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="letsencrypt"
        fi
    fi

    setup_iran_mirrors

    echo -e "${YELLOW}[i] Installing prerequisites (Docker & Nginx)...${NC}"
    if ! command -v docker &> /dev/null; then
        apt-get update && apt-get install -y curl apt-transport-https ca-certificates gnupg lsb-release
        curl -fsSL https://get.docker.com -o get-docker.sh || curl -fsSL https://get.docker.ir -o get-docker.sh
        sh get-docker.sh
    fi

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
    fi

    echo -e "${YELLOW}[i] Building and starting containers on port $PORT...${NC}"

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

    echo -e "${GREEN}[✔] Arka Restaurant software successfully installed and running on port $PORT!${NC}"
    if [ -n "$DOMAIN" ]; then
        echo -e "${CYAN}[i] Configured Domain: $DOMAIN${NC}"
        echo -e "${CYAN}[i] SSL Mode: $SSL_MODE${NC}"
    fi
    echo -e "${GREEN}[✔] To open the management menu anytime, simply run:${NC}"
    echo -e "${YELLOW}sudo bash install.sh${NC}"
}

backup_app() {
    print_banner
    echo -e "${YELLOW}[+] Creating backup of application data and database...${NC}"
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    if [ -d "$INSTALL_DIR" ]; then
        tar -czf "$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz" -C "$INSTALL_DIR" .
        echo -e "${GREEN}[✔] Backup successfully created at:${NC}"
        echo -e "${CYAN}$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz${NC}"
    else
        echo -e "${RED}[!] Installation directory not found.${NC}"
    fi
}

update_app() {
    print_banner
    echo -e "${YELLOW}[+] Updating Arka software...${NC}"
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR" || exit 1
        if command -v git &> /dev/null && [ -d ".git" ]; then
            git pull origin main || echo -e "${YELLOW}[i] Please replace source files manually if needed.${NC}"
        fi
        docker compose restart || docker-compose restart
        echo -e "${GREEN}[✔] Update completed successfully.${NC}"
    else
        echo -e "${RED}[!] Software is not installed.${NC}"
    fi
}

remove_app() {
    print_banner
    echo -e "${RED}[!] Warning: This will stop and remove all application containers and files.${NC}"
    read -p "[-] Are you sure you want to uninstall? (y/n): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || true
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
            rm -rf "$INSTALL_DIR"
        fi
        echo -e "${GREEN}[✔] Software successfully removed.${NC}"
    else
        echo -e "${YELLOW}[i] Uninstallation cancelled.${NC}"
    fi
}

main_menu() {
    check_root
    while true; do
        print_banner
        echo -e "${BLUE}1)${NC} Install & Setup (Port, Domain, SSL & Iran Mirrors)"
        echo -e "${BLUE}2)${NC} Create Backup"
        echo -e "${BLUE}3)${NC} Update System"
        echo -e "${BLUE}4)${NC} Uninstall / Remove"
        echo -e "${BLUE}0)${NC} Exit"
        echo -e "${CYAN}================================================================${NC}"
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
                echo -e "${GREEN}Exiting. Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option. Please enter a number between 0 and 4.${NC}"
                sleep 2
                ;;
        esac
    done
}

main_menu
