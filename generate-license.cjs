#!/usr/bin/env node
/**
 * Admin License Key Generator for Arka Restaurant POS & Tauri Desktop
 * Run on PC or Mobile terminal: node generate-license.cjs ARKA-8F9A-4B2C-1E3D
 */

const crypto = require('crypto');

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';

function calculateLicenseKey(systemCode) {
  if (!systemCode || typeof systemCode !== 'string') {
    return null;
  }
  const cleanCode = systemCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanCode) return null;

  const combined = `${cleanCode}_${MASTER_SECRET_SALT}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  const k1 = hash.substring(0, 4).toUpperCase();
  const k2 = hash.substring(4, 8).toUpperCase();
  const k3 = hash.substring(8, 12).toUpperCase();
  const k4 = hash.substring(12, 16).toUpperCase();

  return `${k1}-${k2}-${k3}-${k4}`;
}

const inputCode = process.argv[2];

console.log('\n' + '═'.repeat(60));
console.log('    مولد کد فعال‌سازی و لایسنس دائمی آرکا - نسخه ادمین');
console.log('       ARKA POS ADMIN HARDWARE LICENSE GENERATOR');
console.log('═'.repeat(60));

if (!inputCode) {
  console.log('\n[!] نحوه استفاده در ترمینال یا کامپیوتر/گوشی:');
  console.log('    node generate-license.cjs ARKA-8F9A-4B2C-1E3D\n');
  console.log('مثال تست:');
  const sampleCode = 'ARKA-8F9A-4B2C-1E3D';
  console.log(`  کد دستگاه نمونه: ${sampleCode}`);
  console.log(`  کد فعال‌سازی تولیدی: ${calculateLicenseKey(sampleCode)}`);
  console.log('═'.repeat(60) + '\n');
  process.exit(0);
}

const generatedKey = calculateLicenseKey(inputCode);

console.log(`\n[+] کد دستگاه مشتری (System Code): ${inputCode.toUpperCase()}`);
console.log(`[✔] کد فعال‌سازی تولید شده (License Key): ${generatedKey}\n`);
console.log('این کد فعال‌سازی فقط و فقط روی همان دستگاه مشتری کار خواهد کرد.');
console.log('═'.repeat(60) + '\n');
