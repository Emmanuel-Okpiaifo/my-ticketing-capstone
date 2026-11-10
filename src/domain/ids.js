import { randomInt, randomUUID } from 'node:crypto';

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const REFERENCE_LENGTH = 8;

export function newId() {
  return randomUUID();
}

export function newReference() {
  const characters = Array.from(
    { length: REFERENCE_LENGTH },
    () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)],
  );
  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}
