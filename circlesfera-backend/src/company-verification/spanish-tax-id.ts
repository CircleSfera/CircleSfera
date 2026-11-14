// Spanish tax IDs: a person's NIF (8 digits and a letter) or NIE (X, Y or Z,
// 7 digits and a letter), and a company's CIF (a letter, 7 digits and a
// control digit or letter). Each is checked with its control character.

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';
// CIF kinds whose control is always a letter, or always a digit.
const CIF_LETTER_CONTROL = 'NPQRSW';
const CIF_DIGIT_CONTROL = 'ABEH';

// Upper case, without spaces, dots or dashes.
export function normalizeTaxId(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

function isPersonId(id: string): boolean {
  const nif = /^(\d{8})([A-Z])$/.exec(id);
  if (nif) return NIF_LETTERS[Number(nif[1]) % 23] === nif[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(id);
  if (nie) {
    const number = Number(`${'XYZ'.indexOf(nie[1])}${nie[2]}`);
    return NIF_LETTERS[number % 23] === nie[3];
  }
  return false;
}

function isCompanyId(id: string): boolean {
  const cif = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(id);
  if (!cif) return false;
  const [, kind, digits, control] = cif;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  const controlDigit = (10 - (sum % 10)) % 10;
  const asDigit = String(controlDigit);
  const asLetter = CIF_CONTROL_LETTERS[controlDigit];
  if (CIF_LETTER_CONTROL.includes(kind)) return control === asLetter;
  if (CIF_DIGIT_CONTROL.includes(kind)) return control === asDigit;
  return control === asDigit || control === asLetter;
}

// A company has a CIF; a sole trader the NIF or NIE of the person.
export function isValidTaxId(
  taxId: string,
  kind: 'COMPANY' | 'SOLE_TRADER',
): boolean {
  const id = normalizeTaxId(taxId);
  return kind === 'COMPANY' ? isCompanyId(id) : isPersonId(id);
}
