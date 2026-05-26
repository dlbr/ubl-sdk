"use strict";

// Object.freeze osigurava da niko ne može da menja mapiranja tokom runtime-a
const CIR_TO_LAT = Object.freeze({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e", "ж": "ž", "з": "z", "и": "i",
    "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č", "џ": "dž", "ш": "š",
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Ђ": "Đ", "Е": "E", "Ж": "Ž", "З": "Z", "И": "I",
    "Ј": "J", "К": "K", "Л": "L", "Љ": "LJ", "М": "M", "Н": "N", "Њ": "NJ", "О": "O", "П": "P", "Р": "R",
    "С": "S", "Т": "T", "Ћ": "Ć", "У": "U", "Ф": "F", "Х": "H", "Ц": "C", "Ч": "Č", "Џ": "DŽ", "Ш": "Š"
});

const LAT_TO_CIR = Object.freeze({
    "lj": "љ", "LJ": "Љ", "Lj": "Љ", "nj": "њ", "NJ": "Њ", "Nj": "Њ", "dž": "џ", "DŽ": "Џ", "Dž": "Џ",
    "a": "а", "b": "б", "v": "в", "g": "г", "d": "д", "đ": "ђ", "e": "е", "ž": "ж", "z": "з", "i": "и",
    "j": "ј", "k": "к", "l": "л", "m": "м", "n": "н", "o": "о", "p": "п", "r": "р", "s": "с", "t": "т",
    "ć": "ћ", "u": "у", "f": "ф", "h": "х", "c": "ц", "č": "ч", "š": "ш",
    "A": "А", "B": "Б", "V": "В", "G": "Г", "D": "Д", "Đ": "Ђ", "E": "Е", "Ž": "Ж", "Z": "З", "I": "И",
    "J": "Ј", "K": "К", "L": "Л", "M": "М", "N": "Н", "O": "О", "P": "П", "R": "Р", "S": "С", "T": "Т",
    "Ć": "Ћ", "U": "У", "F": "Ф", "H": "Х", "C": "Ц", "Č": "Ч", "Š": "Ш"
});

// Regex se kompajlira jednom pri učitavanju modula radi performansi
const LAT_REGEX = /lj|LJ|Lj|nj|NJ|Nj|dž|DŽ|Dž|[a-zđžćčšA-ZĐŽĆČŠ]/g;
const CIR_REGEX = /[а-шА-Ш]/g;

export class DataConvert {
    /**
     * Konvertuje ćirilicu u latinicu.
     * @param {string} text - Ulazni tekst.
     */
    static cir2Lat(text) {
        if (typeof text !== 'string') return '';
        // Normalizacija rešava homografske probleme
        return text.normalize("NFKC").replace(CIR_REGEX, (char) => CIR_TO_LAT[char] || char);
    }

    /**
     * Konvertuje latinicu u ćirilicu.
     * @param {string} text - Ulazni tekst.
     */
    static lat2Cir(text) {
        if (typeof text !== 'string') return '';
        return text.normalize("NFKC").replace(LAT_REGEX, (match) => LAT_TO_CIR[match] || match);
    }
}