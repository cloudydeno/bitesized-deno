// port of https://github.com/avoidwork/filesize.js

/**
 * filesize
 *
 * @copyright 2020 Jason Mulligan <jason.mulligan@avoidwork.com>
 * @license BSD-3-Clause
 * @version 6.1.0
 */

export interface SiJedecBits {
  b?: string;
  Kb?: string;
  Mb?: string;
  Gb?: string;
  Tb?: string;
  Pb?: string;
  Eb?: string;
  Zb?: string;
  Yb?: string;
}

export interface SiJedecBytes {
  B?: string;
  KB?: string;
  MB?: string;
  GB?: string;
  TB?: string;
  PB?: string;
  EB?: string;
  ZB?: string;
  YB?: string;
}

export type SiJedec = SiJedecBits & SiJedecBytes & { [name: string]: string };

export interface Options {
  /**
    * Number base, default is 2
    */
  base?: number;
  /**
    * Enables bit sizes, default is false
    */
  bits?: boolean;
  /**
    * Specifies the SI suffix via exponent, e.g. 2 is MB for bytes, default is -1
    */
  exponent?: number;
  /**
    * Enables full form of unit of measure, default is false
    */
  fullform?: boolean;
  /**
    * Array of full form overrides, default is []
    */
  fullforms?: string[];
  /**
    * BCP 47 language tag to specify a locale, or true to use default locale, default is ""
    */
  locale?: string | true;
  /**
    * ECMA-402 number format option overrides, default is "{}"
    */
  localeOptions?: Intl.NumberFormatOptions;
  /**
    * Output of function (array, exponent, object, or string), default is string
    */
  output?: "array" | "exponent" | "object" | "string";
  /**
    * Decimal place, default is 2
    */
  round?: number;
  /**
    * Decimal separator character, default is `.`
    */
  separator?: string;
  /**
    * Character between the result and suffix, default is ` `
    */
  spacer?: string;
  /**
    * Standard unit of measure, can be iec or jedec, default is jedec; can be overruled by base
    */
  standard?: "iec" | "jedec";
  /**
    * Dictionary of SI/JEDEC symbols to replace for localization, defaults to english if no match is found
    */
  symbols?: SiJedec;
  /**
    *  Enables unix style human readable output, e.g ls -lh, default is false
    */
  unix?: boolean;
}


const b = /^(b|B)$/;
const symbol = {
  iec: {
    bits: ["b", "Kib", "Mib", "Gib", "Tib", "Pib", "Eib", "Zib", "Yib"],
    bytes: ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
  },
  jedec: {
    bits: ["b", "Kb", "Mb", "Gb", "Tb", "Pb", "Eb", "Zb", "Yb"],
    bytes: ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
  }
};
const fullform = {
  iec: ["", "kibi", "mebi", "gibi", "tebi", "pebi", "exbi", "zebi", "yobi"],
  jedec: ["", "kilo", "mega", "giga", "tera", "peta", "exa", "zetta", "yotta"]
};


export function filesize (arg: number, descriptor: Options & {output: 'array'}): (number|string)[];
export function filesize (arg: number, descriptor: Options & {output: 'object'}): {value: number, symbol: string, exponent: number};
export function filesize (arg: number, descriptor: Options & {output: 'exponent'}): number;
export function filesize (arg: number, descriptor?: Options): string;

export function filesize (arg: number, descriptor: Options = {}) {
  if (isNaN(arg as number)) {
    throw new TypeError("Invalid number");
  }

  let result = new Array<string | number>();
  let val = 0;
  let bits = descriptor.bits === true;
  let unix = descriptor.unix === true;
  let base = descriptor.base || 2;
  let round = descriptor.round !== void 0 ? descriptor.round : unix ? 1 : 2;
  let locale = descriptor.locale !== void 0 ? descriptor.locale : "";
  let localeOptions = descriptor.localeOptions || {};
  let separator = descriptor.separator !== void 0 ? descriptor.separator : "";
  let spacer = descriptor.spacer !== void 0 ? descriptor.spacer : unix ? "" : " ";
  let symbols = descriptor.symbols || {};
  let standard = base === 2 ? descriptor.standard || "jedec" : "jedec";
  let output = descriptor.output || "string";
  let full = descriptor.fullform === true;
  let fullforms = descriptor.fullforms instanceof Array ? descriptor.fullforms : [];
  let e = descriptor.exponent !== void 0 ? descriptor.exponent : -1;
  let num = Number(arg);
  let neg = num < 0;
  let ceil = base > 2 ? 1000 : 1024;

  // Flipping a negative number to determine the size
  if (neg) {
    num = -num;
  }

  // Determining the exponent
  if (e === -1 || isNaN(e)) {
    e = Math.floor(Math.log(num) / Math.log(ceil));

    if (e < 0) {
      e = 0;
    }
  }

  // Exceeding supported length, time to reduce & multiply
  if (e > 8) {
    e = 8;
  }

  if (output === "exponent") {
    return e;
  }

  // Zero is now a special case because bytes divide by 1
  if (num === 0) {
    result[0] = 0;
    result[1] = unix ? "" : symbol[standard][bits ? "bits" : "bytes"][e];
  } else {
    val = num / (base === 2 ? Math.pow(2, e * 10) : Math.pow(1000, e));

    if (bits) {
      val = val * 8;

      if (val >= ceil && e < 8) {
        val = val / ceil;
        e++;
      }
    }

    result[0] = Number(val.toFixed(e > 0 ? round : 0));

    if (result[0] === ceil && e < 8 && descriptor.exponent === void 0) {
      result[0] = 1;
      e++;
    }

    result[1] = base === 10 && e === 1 ? bits ? "kb" : "kB" : symbol[standard][bits ? "bits" : "bytes"][e];

    if (unix) {
      result[1] = standard === "jedec" ? result[1].charAt(0) : e > 0 ? result[1].replace(/B$/, "") : result[1];

      if (b.test(result[1])) {
        result[0] = Math.floor(result[0]);
        result[1] = "";
      }
    }
  }

  // Decorating a 'diff'
  if (neg) {
    result[0] = -result[0];
  }

  // Applying custom symbol
  result[1] = symbols[result[1]] || result[1];

  if (locale === true) {
    result[0] = result[0].toLocaleString();
  } else if (locale.length > 0) {
    result[0] = result[0].toLocaleString(locale, localeOptions);
  } else if (separator.length > 0) {
    result[0] = result[0].toString().replace(".", separator);
  }

  // Returning Array, Object, or String (default)
  if (output === "array") {
    return result;
  }

  if (full) {
    result[1] = fullforms[e] ? fullforms[e] : fullform[standard][e] + (bits ? "bit" : "byte") + (result[0] === 1 ? "" : "s");
  }

  if (output === "object") {
    return {value: result[0], symbol: result[1], exponent: e};
  }

  return result.join(spacer);
}
