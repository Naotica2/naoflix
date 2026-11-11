/**
 * @deprecated .naov encryption was disabled in favor of direct MP4 stability and performance.
 * Downloads folder now relies on a .nomedia file to keep files hidden from the gallery without CPU/memory overhead.
 */
export class NaovCrypto {
  public static async isNaovFile(_filePath: string): Promise<boolean> {
    return false;
  }
}

export default NaovCrypto;
