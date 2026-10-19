/**
 * Hardware-Based Offline Licensing Engine for Arka Restaurant POS & Tauri Desktop
 * 
 * Flow:
 * 1. Generates deterministic Hardware/System Code (e.g. ARKA-8F9A-4B2C-1E3D)
 * 2. Admin uses generator script with Secret Salt to create matching License Key
 * 3. Client verifies key offline and persists activation.
 */

const MASTER_SECRET_SALT = 'ARKA_POS_OFFLINE_SECRET_SALT_2026_x987654321_REST_SYS';
const MASTER_EMERGENCY_KEY = 'ARKA-9999-MASTER-OVERRIDE-KEY';

export interface LicenseInfo {
  isActivated: boolean;
  systemCode: string;
  licenseKey?: string;
  activatedAt?: string;
  isEmergencyOverride?: boolean;
}

/**
 * Simple fast SHA256 string hasher using Web Crypto API or fallback
 */
async function sha256Hex(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback
    }
  }

  // Fallback FNV-1a hash generator if Web Crypto unavailable
  let hash1 = 2166136261;
  let hash2 = 30503041;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 ^= char;
    hash1 = Math.imul(hash1, 16777619);
    hash2 ^= char;
    hash2 = Math.imul(hash2, 1099511628211 || 16777619);
  }
  const h1Hex = (hash1 >>> 0).toString(16).padStart(8, '0');
  const h2Hex = (hash2 >>> 0).toString(16).padStart(8, '0');
  return h1Hex + h2Hex + h1Hex + h2Hex;
}

/**
 * Gets or creates a persistent device seed stored in localStorage
 */
function getPersistentDeviceSeed(): string {
  if (typeof window === 'undefined') return 'ARKA_SERVER_DEFAULT_SEED';
  
  let seed = localStorage.getItem('arka_device_seed');
  if (!seed) {
    const randomBytes = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
    seed = `DEV_${Date.now().toString(36)}_${randomBytes}`;
    try {
      localStorage.setItem('arka_device_seed', seed);
    } catch {
      // ignore
    }
  }
  return seed;
}

/**
 * Generates human-friendly 16-character Hardware System Code (e.g., ARKA-8F9A-4B2C-1E3D)
 */
export async function getSystemCode(): Promise<string> {
  if (typeof window === 'undefined') return 'ARKA-0000-SERVER';

  const deviceSeed = getPersistentDeviceSeed();
  const screenSig = `${window.screen?.width || 1920}x${window.screen?.height || 1080}_${window.screen?.colorDepth || 24}`;
  const userAgent = window.navigator?.userAgent || 'Browser';
  const platform = window.navigator?.platform || 'Win32';
  const language = window.navigator?.language || 'fa-IR';
  const cores = window.navigator?.hardwareConcurrency || 4;

  const rawFingerprint = `ARKA_HW_${deviceSeed}_${screenSig}_${userAgent}_${platform}_${language}_${cores}`;
  const fullHash = await sha256Hex(rawFingerprint);

  const part1 = fullHash.substring(0, 4).toUpperCase();
  const part2 = fullHash.substring(4, 8).toUpperCase();
  const part3 = fullHash.substring(8, 12).toUpperCase();

  return `ARKA-${part1}-${part2}-${part3}`;
}

/**
 * Generates matching License Key for a given System Code using Master Secret Salt.
 * THIS IS THE LOGIC USED BY THE ADMIN LICENSE GENERATOR.
 */
export async function calculateLicenseKeyForSystemCode(systemCode: string): Promise<string> {
  const cleanCode = systemCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const combined = `${cleanCode}_${MASTER_SECRET_SALT}`;
  const hash = await sha256Hex(combined);

  const k1 = hash.substring(0, 4).toUpperCase();
  const k2 = hash.substring(4, 8).toUpperCase();
  const k3 = hash.substring(8, 12).toUpperCase();
  const k4 = hash.substring(12, 16).toUpperCase();

  return `${k1}-${k2}-${k3}-${k4}`;
}

/**
 * Verifies if user entered key matches current System Code or Master Emergency Key
 */
export async function verifyLicenseKey(userKey: string, targetSystemCode?: string): Promise<{ valid: boolean; isEmergency?: boolean; message: string }> {
  const cleanKey = userKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanEmergency = MASTER_EMERGENCY_KEY.replace(/[^A-Z0-9]/g, '');

  if (cleanKey === cleanEmergency) {
    return { valid: true, isEmergency: true, message: 'کد اضطراری پشتیبانی فعال شد.' };
  }

  const sysCode = targetSystemCode || (await getSystemCode());
  const expectedKey = await calculateLicenseKeyForSystemCode(sysCode);
  const cleanExpected = expectedKey.replace(/[^A-Z0-9]/g, '');

  if (cleanKey === cleanExpected) {
    return { valid: true, isEmergency: false, message: 'لایسنس نرم‌افزار با موفقیت تأیید شد.' };
  }

  return { valid: false, message: 'کد فعال‌سازی وارد شده مربوط به این سیستم نمی‌باشد.' };
}

/**
 * Gets current activation status from local storage
 */
export async function getLicenseStatus(): Promise<LicenseInfo> {
  const sysCode = await getSystemCode();

  if (typeof window === 'undefined') {
    return { isActivated: true, systemCode: sysCode };
  }

  try {
    const rawData = localStorage.getItem('arka_license_info');
    if (!rawData) {
      return { isActivated: false, systemCode: sysCode };
    }

    const info = JSON.parse(rawData);
    if (!info.licenseKey || info.systemCode !== sysCode) {
      return { isActivated: false, systemCode: sysCode };
    }

    const check = await verifyLicenseKey(info.licenseKey, sysCode);
    if (check.valid) {
      return {
        isActivated: true,
        systemCode: sysCode,
        licenseKey: info.licenseKey,
        activatedAt: info.activatedAt,
        isEmergencyOverride: check.isEmergency,
      };
    }
  } catch {
    // ignore
  }

  return { isActivated: false, systemCode: sysCode };
}

/**
 * Activates the application with the given user key
 */
export async function activateApplication(userKey: string): Promise<{ success: boolean; message: string }> {
  const sysCode = await getSystemCode();
  const check = await verifyLicenseKey(userKey, sysCode);

  if (!check.valid) {
    return { success: false, message: check.message };
  }

  const licenseRecord = {
    systemCode: sysCode,
    licenseKey: userKey.trim().toUpperCase(),
    activatedAt: new Date().toISOString(),
    isEmergency: check.isEmergency || false,
  };

  try {
    localStorage.setItem('arka_license_info', JSON.stringify(licenseRecord));
  } catch (e: any) {
    return { success: false, message: `خطا در ذخیره‌سازی لایسنس: ${e?.message}` };
  }

  return { success: true, message: 'نرم‌افزار آرکا با موفقیت فعال گردید.' };
}

/**
 * Deactivates / removes current license
 */
export function deactivateApplication() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('arka_license_info');
    } catch {
      // ignore
    }
  }
}
