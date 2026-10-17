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
NC='\033[0m' # No Color

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
    }
}

setup_iran_mirrors() {
    echo -e "${YELLOW}[i] تنظیم مخازن و میرورهای داخلی (جهت تحریم‌شکنی و کار در نت ملی)...${NC}"
    
    # Configure Docker registry mirror if needed or use local fallback
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

    # 1. Check if source files are already uploaded in current directory or need git clone
    mkdir -p "$INSTALL_DIR"
    
    if [ -f "./package.json" ] || [ -f "./Dockerfile" ]; then
        echo -e "${GREEN}[✓] فایل‌های پروژه در مسیر فعلی یافت شدند. در حال انتقال به پوشه نصب...${NC}"
        cp -r ./* "$INSTALL_DIR"/ 2>/dev/null || true
    else
        echo -e "${YELLOW}[i] در حال دریافت سورس کد از مخزن گیت‌هاب (یا استفاده از پروکسی/میرور)...${NC}"
        if command -v git &> /dev/null; then
            git clone "$REPO_URL" "$INSTALL_DIR" || {
                echo -e "${RED}[!] خطا در دریافت از گیت‌هاب. لطفا فایل‌های پروژه را به سرور آپلود کرده و مجدداً اسکریپت را اجرا کنید.${NC}ء"
            }
        else
            apt-get update && apt-get install -y git
            git clone "$REPO_URL" "$INSTALL_DIR"
        fi
    fi

    cd "$INSTALL_DIR" || exit 1

    # 2. Get Custom Port
    read -p "[-] پورت دلخواه برای اجرای نرم‌افزار (پیش‌فرض 3000): " PORT
    PORT=${PORT:-3000}

    # 3. Domain & SSL Setup
    read -p "[-] آیا تمایل به اتصال دامنه و SSL دارید؟ (y/n): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="iran_local" # iran_local | letsencrypt

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
        apt-get update && apt-get install -y curl git docker.io docker-compose nginx
        systemctl enable --now docker nginx
    else
        apt-get install -y nginx
    fi

    # Create Dockerfile if not present
    if [ ! -f "Dockerfile" ]; then
        cat <<EOF > Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --registry=https://registry.npmmirror.com || npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE ${PORT}
CMD ["npm", "run", "start"]
EOF
    fi

    # Create docker-compose.yml
    cat <<EOF > docker-compose.yml
version: '3.8'
services:
  arka-restaurant:
    build: .
    restart: always
    ports:
      - "${PORT}:3000"
    environment:
      - PORT=3000
EOF

    # Configure Nginx & SSL
    if [ -n "$DOMAIN" ]; then
        mkdir -p /etc/nginx/ssl/$DOMAIN
        if [ "$SSL_MODE" == "letsencrypt" ]; then
            apt-get install -y certbot python3-certbot-nginx
            certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN" || true
        else
            openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
                -keyout /etc/nginx/ssl/$DOMAIN/privkey.pem \
                -out /etc/nginx/ssl/$DOMAIN/fullchain.pem \
                -subj "/CN=$DOMAIN/O=Arka Restaurant Melli/C=IR"
        fi

        cat <<EOF > /etc/nginx/sites-available/$APP_NAME
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/nginx/ssl/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
        nginx -t && systemctl reload nginx
    fi

    echo -e "${YELLOW}[i] در حال ساخت و اجرای کانتینر در محیط سرور...${NC}"
    docker-compose up -d --build

    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${GREEN} ✅ نصب و راه‌اندازی نرم‌افزار آرکا با موفقیت به اتمام رسید! ${NC}"
    if [ -n "$DOMAIN" ]; then
        echo -e "${CYAN} 🌐 آدرس امن: https://${DOMAIN}${NC}"
    else
        echo -e "${CYAN} 🌐 آدرس دسترسی: http://<IP_SERVER>:${PORT}${NC}"
    fi
    echo -e "${GREEN}================================================================${NC}"
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

backup_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال تهیه نسخه پشتیبان از داده‌ها...${NC}"
    BACKUP_DIR="/opt/arka-backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz"

    tar -czf "$BACKUP_FILE" -C "$INSTALL_DIR" . 2>/dev/null || true
    echo -e "${GREEN}[✓] بکاپ با موفقیت در مسیر زیر ذخیره شد:${NC}"
    echo -e "${CYAN}    $BACKUP_FILE${NC}"
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

update_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال به‌روزرسانی سیستم...${NC}"
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR" || exit 1
        if [ -d ".git" ]; then
            git pull || echo -e "${YELLOW}[i] به‌روزرسانی گیت انجام نشد، از فایل‌های محلی استفاده می‌شود.${NC}"
        fi
        docker-compose down
        docker-compose up -d --build
        echo -e "${GREEN}[✓] به‌روزرسانی نرم‌افزار با موفقیت انجام شد.${NC}"
    else
        echo -e "${RED}[!] ابتدا نرم‌افزار را نصب کنید.${NC}"
    fi
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

remove_app() {
    print_banner
    echo -e "${RED}[!] هشدار: با این کار کل سیستم و اطلاعات آن حذف خواهد شد!${NC}"
    read -p "[-] آیا از حذف کامل (Remove & Box) مطمئن هستید؟ (y/N): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || exit 1
            docker-compose down -v || true
            rm -rf "$INSTALL_DIR"
            rm -f /etc/nginx/sites-enabled/$APP_NAME
            rm -f /etc/nginx/sites-available/$APP_NAME
            systemctl reload nginx
            echo -e "${GREEN}[✓] نرم‌افزار و باکس‌های مربوطه کاملاً حذف شدند.${NC}"
        else
            echo -e "${YELLOW}[i] پوشه نصب یافت نشد.${NC}"
        fi
    fi
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

# ------------------------------------------------------------------------------
# راهنمای آپلود فایل‌های سورس در سرور (آپلود دستی)
# ------------------------------------------------------------------------------
# اگر فایل‌های پروژه را به جای گیت‌هاب مستقیماً روی سرور (مثلاً در پوشه /root/restaurant)
# آپلود کرده‌اید، کافیست دستور زیر را بزنید تا منو باز شود و کدهای آپلود شده را نصب کند:
#   cd /root/restaurant && bash install.sh
# ------------------------------------------------------------------------------

check_root
while true; do
    print_banner
    echo -e " لطفاً یک گزینه را انتخاب کنید:\n"
    echo -e "   ${GREEN}1) نصب نرم‌افزار (پورت دلخواه، دامنه و SSL داخلی/خارجی)${NC}"
    echo -e "   ${BLUE}2) پشتیبان‌گیری (Backup)${NC}"
    echo -e "   ${CYAN}3) به‌روزرسانی (Update)${NC}"
    echo -e "   ${RED}4) حذف کامل نرم‌افزار و باکس (Remove)${NC}"
    echo -e "   ${YELLOW}5) خروج (Exit)${NC}"
    echo -e ""
    read -p "[-] انتخاب شما (1-5): " CHOICE

    case $choice in
        1) install_app ;;
        2) backup_app ;;
        3) update_app ;;
        4) remove_app ;;
        5) echo -e "${GREEN}خروج.${NC}"; exit 0 ;;
        *) echo -e "${RED}گزینه نامعتبر.${NC}; sleep 2 ;;
    esac
done
