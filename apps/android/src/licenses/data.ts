/** Shape of the generated licenses file shown in the app. */
export interface LicensePackage {
  name: string;
  version: string;
  /** SPDX-style license name from the package, such as "MIT". */
  license: string;
  homepage?: string;
  /** Keys into `texts`. Empty if the package shipped no license file. */
  texts: string[];
}

export interface LicenseData {
  /** CD Wallet's own license text. */
  appLicense: string;
  /** Each distinct license text once, keyed by a short hash. */
  texts: Record<string, string>;
  packages: LicensePackage[];
}

export function textsFor(data: LicenseData, pkg: LicensePackage): string[] {
  return pkg.texts.map((id) => data.texts[id]).filter((t): t is string => typeof t === "string");
}

/** One-line description used when a package carries no license file of its own. */
export function noTextNote(pkg: LicensePackage): string {
  return `${pkg.name} is licensed under ${pkg.license}. The package did not include a license file.`;
}
