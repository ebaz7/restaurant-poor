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
 * Pure synchronous SHA-256 implementation so both HTTPS/Tauri and LAN HTTP generate identical hashes
 */
function sha256Pure(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];
      const a = hash[0],
        e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function fnvFallbackHex(str: string): string {
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
 * Simple fast SHA256 string hasher using pure JS SHA-256
 */
async function sha256Hex(str: string): Promise<string> {
  const pure = sha256Pure(str);
  if (pure) return pure;
  return fnvFallbackHex(str);
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
 * Verifies if user entered key matches current System Code (SHA-256 or legacy FNV) or Master Emergency Key
 */
export async function verifyLicenseKey(userKey: string, targetSystemCode?: string): Promise<{ valid: boolean; isEmergency?: boolean; message: string }> {
  const cleanKey = userKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanEmergency = MASTER_EMERGENCY_KEY.replace(/[^A-Z0-9]/g, '');

  if (cleanKey === cleanEmergency) {
    return { valid: true, isEmergency: true, message: 'کد اضطراری پشتیبانی فعال شد.' };
  }

  const sysCode = targetSystemCode || (await getSystemCode());
  const cleanCode = sysCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const combined = `${cleanCode}_${MASTER_SECRET_SALT}`;

  const shaHash = sha256Pure(combined).substring(0, 16).toUpperCase();
  const fnvHash = fnvFallbackHex(combined).substring(0, 16).toUpperCase();

  if (cleanKey === shaHash || cleanKey === fnvHash) {
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
