export interface EncryptedData {
    iv: string;
    encrypted: string;
    tag: string;
}
/** AES-256-GCM 암호화 */
export declare function encrypt(plainText: string): EncryptedData;
/** AES-256-GCM 복호화 */
export declare function decrypt(data: EncryptedData): string;
/** DB에 저장된 JSON 문자열에서 복호화 */
export declare function decryptFromJson(jsonStr: string): string;
/** 암호화 후 JSON 문자열로 변환 (DB 저장용) */
export declare function encryptToJson(plainText: string): string;
//# sourceMappingURL=encryption.d.ts.map