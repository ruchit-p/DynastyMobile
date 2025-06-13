import { WebVaultCryptoService } from "../../services/encryption/VaultCryptoService";

/**
 * End-to-end vault integration test
 * Simulates the full client flow: generate keys → encrypt file → "upload" (noop)
 * → "download" (noop) → decrypt file and verify integrity.
 *
 * The goal is to guarantee that no regressions break the round-trip process
 * utilised by the web vault. This runs entirely in-memory and therefore
 * executes fast enough to be part of CI without requiring Firebase emulators.
 */

describe("Vault e2e → encrypt → decrypt round-trip", () => {
  const cryptoService = WebVaultCryptoService.getInstance();

  beforeAll(async () => {
    await cryptoService.initialize();
  });

  it("should encrypt, upload (mock), download (mock) and decrypt back to original payload", async () => {
    // 1️⃣  Generate master key and per-file key
    const masterKey = cryptoService.generateFileKey(); // 32-byte random key
    const fileId = cryptoService.generateSecureFileId();
    const fileKey = cryptoService.deriveFileKey(masterKey, fileId);

    // 2️⃣  Prepare sample data (simulate a small text file)
    const plaintext = new TextEncoder().encode("Vault-Roundtrip-✓");

    // 3️⃣  Encrypt the data (client-side pre-upload phase)
    const { encryptedFile, header, metadata } = await cryptoService.encryptFile(
      plaintext.buffer,
      fileKey
    );

    // Sanity checks – ciphertext MUST differ from plaintext
    expect(encryptedFile).not.toEqual(plaintext);
    expect(metadata.size).toBe(plaintext.length);

    // 4️⃣  "Upload" step would occur here (omitted – bytes kept in memory)
    // 5️⃣  "Download" step – we already have encryptedFile, header, metadata

    // 6️⃣  Decrypt and verify
    const decrypted = await cryptoService.decryptFile(
      encryptedFile,
      header,
      fileKey,
      metadata
    );

    expect(decrypted).toEqual(plaintext);
  });
}); 