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
    echo -e "${CYAN}   نصب‌کننده هوشمند و آفلاین‌پذیر نرم‌افزار رستورانی آرکا (Linux)   ${NC}"
    echo -e "${CYAN}   سازگار با اینترنت ملی، میرورهای داخلی و سرورهای بدون تحریم     ${NC}"
    echo -e "${CYAN}================================================================${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[!] لطفاً این اسکریپت را با دسترسی روت (sudo bash) اجرا کنید.${NC}"
        exit 1
    fi
}

setup_iran_mirrors() {
    echo -e "${YELLOW}[i] تنظیم مخازن و میرورهای داخلی (جهت تحریم‌شکنی و کار در نت ملی)...${NC}"
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
    echo -e "${YELLOW}[+] شروع فرآیند نصب سیستم آرکا...${NC}"

    mkdir -p "$INSTALL_DIR"
    
    if [ -f "./package.json" ] || [ -f "./Dockerfile" ]; then
        echo -e "${GREEN}[✓] فایل‌های پروژه در مسیر فعلی یافت شدند. در حال انتقال به پوشه نصب...${NC}"
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
    else
        echo -e "${YELLOW}[i] در حال دریافت سورس کد از مخزن گیت‌هاب (یا استفاده از پروکسی/میرور)...${NC}"
        if command -v git &> /dev/null; then
            git clone "$REPO_URL" "$INSTALL_DIR" || {
                echo -e "${RED}[!] خطا در دریافت از گیت‌هاب. لطفا فایل‌های پروژه را به سرور آپلود کرده و مجدداً اسکریپت را اجرا کنید.${NC}"
            }
        else
            apt-get update && apt-get install -y git
            git clone "$REPO_URL" "$INSTALL_DIR"
        fi
    fi

    cd "$INSTALL_DIR" || exit 1

    read -p "[-] پورت دلخواه برای اجرای نرم‌افزار (پیش‌فرض 3000): " PORT
    PORT=${PORT:-3000}

    read -p "[-] آیا تمایل به اتصال دامنه و SSL دارید؟ (y/n): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="iran_local"

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] دامنه خود را وارد کنید (مثال: restaurant.local یا rezvan.ir): " DOMAIN
        echo -e "\n${CYAN}انتخاب نحوه صدور گواهی SSL:${NC}"
        echo "1) تولید گواهی داخلی (Self-Signed / بدون نیاز به اینترنت خارجی و مناسب نت ملی)"
        echo "2) دریافت گواهی از طریق سرورهای بین‌المللی (Let's Encrypt)"
        read -p "[-] انتخاب کنید (1 یا 2، پیش‌فرض 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}
        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="letsencrypt"
        fi
    fi

    setup_iran_mirrors

    echo -e "${YELLOW}[i] در حال نصب پیش‌نیازها (Docker & Nginx)...${NC}"
    if ! command -v docker &> /dev/null; then
        apt-get update && apt-get install -y curl apt-transport-https ca-certificates gnupg lsb-release
        curl -fsSL https://get.docker.com -o get-docker.sh || curl -fsSL https://get.docker.ir -o get-docker.sh
        sh get-docker.sh
    fi

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
    fi

    echo -e "${YELLOW}[i] در حال ساخت و راه‌اندازی کانتینرها با پورت $PORT...${NC}"

    cat <<EOF > docker-compose.yml
version: '3.8'
services:
  arka-app:
  image: node:20-alpine
  container_path: /app
  working_dir: /app
  restart: always
  ports:
    - "${PORT}:3000"
  command: sh -c "npm install -g pnpm && pnpm install --frozen-lockfile || npm install && npm run build && node server.ts"
  volumes:
    - .:/app
EOF

    docker compose up -d --build || docker-compose up -d --build

    echo -e "${GREEN}[✔] نرم‌افزار آرکا با موفقیت روی پورت $PORT نصب و راه‌اندازی شد!${NC}"
    if [ -n "$DOMAIN" ]; then
        echo -e "${CYAN}[i] دامنه متصل شده: $DOMAIN${NC}"
        echo -e "${CYAN}[i] حالت SSL: $SSL_MODE${NC}"
    fi
    echo -e "${GREEN}[✔] برای دسترسی به منوی مدیریت، کافیست مجدداً دستور زیر را اجرا کنید:${NC}"
    echo -e "${YELLOW}sudo bash install.sh${NC}"
}

backup_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال تهیه پشتیبان (Backup) از اطلاعات و پایگاه داده...${NC}"
    BACKUP_DIR="/opt/arka-backup"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    if [ -d "$INSTALL_DIR" ]; then
        tar -czf "$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz" -C "$INSTALL_DIR" .
        echo -e "${GREEN}[✔] پشتیبان با موفقیت در مسیر زیر ذخیره شد:${NC}"
        echo -e "${CYAN}$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz${NC}"
    else
        echo -e "${RED}[!] پوشه نصب نرم‌افزار یافت نشد.${NC}"
    fi
}

update_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال به‌روزرسانی نرم‌افزار آرکا...${NC}"
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR" || exit 1
        if command -v git &> /dev/null && [ -d ".git" ]; then
            git pull origin main || echo -e "${YELLOW}[i] لطفا سورس جدید را جایگزین کنید.${NC}"
        fi
        docker compose restart || docker-compose restart
        echo -e "${GREEN}[✔] به‌روزرسانی با موفقیت انجام شد.${NC}"
    else
        echo -e "${RED}[!] نرم‌افزار نصب نشده است.${NC}"
    fi
}

remove_app() {
    print_banner
    echo -e "${RED}[!] هشدار: با این کار نرم‌افزار و کانتینرها متوقف و حذف خواهند شد.${NC}"
    read -p "[-] آیا از حذف کامل اطمینان دارید؟ (y/n): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || true
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
            rm -rf "$INSTALL_DIR"
        fi
        echo -e "${GREEN}[✔] نرم‌افزار با موفقیت حذف شد.${NC}"
    else
        echo -e "${YELLOW}[i] عملیات حذف لغو شد.${NC}"
    fi
}

main_menu() {
    check_root
    while true; do
        print_banner
        echo -e "${BLUE}1)${NC} نصب و راه‌اندازی (پورت، دامنه، SSL و میرور داخلی)"
        echo -e "${BLUE}2)${NC} تهیه نسخه پشتیبان (Backup)"
        echo -e "${BLUE}3)${NC} به‌روزرسانی سیستم (Update)"
        echo -e "${BLUE}4)${NC} حذف کامل نرم‌افزار (Uninstall / Box)"
        echo -e "${BLUE}0)${NC} خروج"
        echo -e "${CYAN}================================================================${NC}"
        read -p "[-] گزینه مورد نظر را انتخاب کنید (0-4): " CHOICE

        case "$CHOICE" in
            1)
                install_app
                read -p "[-] برای بازگشت به منو اینتر بزنید..."
                ;;
            2)
                backup_app
                read -p "[-] برای بازگشت به منو اینتر بزنید..."
                ;;
            3)
                update_app
                read -p "[-] برای بازگشت به منو اینتر بزنید..."
                ;;
            4)
                remove_app
                read -p "[-] برای بازگشت به منو اینتر بزنید..."
                ;;
            0)
                echo -e "${GREEN}خروج. روز خوش!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}گزینه نامعتبر. لطفاً عددی بین 0 تا 4 وارد کنید.${NC}"
                sleep 2
                ;;
        esac
    done
}

main_menu
