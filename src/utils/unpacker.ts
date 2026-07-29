/* eslint-disable radix */
export function detect(source: string) {
  return source.replace(' ', '').startsWith('eval(function(p,a,c,k,e,');
}

export function unpack(source: string) {
  let { payload, symtab, radix, count } = _filterargs(source);

  if (count !== symtab.length) {
    throw Error('Malformed p.a.c.k.e.r. symtab.');
  }

  let unbase: Unbaser;
  try {
    unbase = new Unbaser(radix);
  } catch (e) {
    throw Error('Unknown p.a.c.k.e.r. encoding.');
  }

  function lookup(match: string): string {
    const word = match;
    let word2: string;
    if (radix === 1) {
      //throw Error("symtab unknown");
      word2 = symtab[parseInt(word)];
    } else {
      word2 = symtab[unbase.unbase(word)];
    }
    return word2 || word;
  }

  source = payload.replace(/\b\w+\b/g, lookup);
  return _replacestrings(source);

  function _filterargs(src: string) {
    const juicers = [
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
    ];
    for (const juicer of juicers) {
      //const args = re.search(juicer, source, re.DOTALL);
      const args = juicer.exec(src);
      if (args) {
        let a = args;
        if (a[2] === '[]') {
          // a = list(a);
          // a = tuple(a);
        }
        try {
          return {
            payload: a[1],
            symtab: a[4].split('|'),
            radix: parseInt(a[2]),
            count: parseInt(a[3]),
          };
        } catch (ValueError) {
          throw Error('Corrupted p.a.c.k.e.r. data.');
        }
      }
    }
    throw Error('Could not make sense of p.a.c.k.e.r data (unexpected code structure)');
  }

  function _replacestrings(src: string): string {
    return src;
  }
}

class Unbaser {
  protected ALPHABET: Record<number, string> = {
    62: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    // eslint-disable-next-line no-useless-escape
    95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
  };
  protected base: number;
  protected dictionary: Record<string, number> = {};

  constructor(base: number) {
    this.base = base;

    if (base > 36 && base < 62) {
      this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substr(0, base);
    }
    if (base >= 2 && base <= 36) {
      this.unbase = value => parseInt(value, base);
    } else {
      try {
        [...this.ALPHABET[base]].forEach((cipher, index) => {
          this.dictionary[cipher] = index;
        });
      } catch (er) {
        throw Error('Unsupported base encoding.');
      }
      this.unbase = this._dictunbaser;
    }
  }

  public unbase: (a: string) => number;

  private _dictunbaser(value: string): number {
    let ret = 0;
    [...value].reverse().forEach((cipher, index) => {
      ret = ret + this.base ** index * this.dictionary[cipher];
    });
    return ret;
  }
}
