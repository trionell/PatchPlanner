package consolefile

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// letters with no decomposition into a base letter and a mark.
var asciiSpelling = map[rune]string{
	'ß': "ss", 'æ': "ae", 'Æ': "AE", 'ø': "o", 'Ø': "O", 'œ': "oe", 'Œ': "OE",
	'ł': "l", 'Ł': "L", 'đ': "d", 'Đ': "D", 'þ': "th", 'Þ': "Th",
}

// ASCII respells a name in English letters: å ä → a, ö → o, é → e, ß → ss.
// M32-Edit silently loads nothing from a scene file whose name has a Swedish
// letter in it (found 2026-10-18), and the desk's own font has none either, so
// every name the export writes, and the file it is saved as, goes through this.
// Anything still outside printable ASCII becomes '_'.
func ASCII(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		switch {
		case unicode.Is(unicode.Mn, r):
			// the accent a letter was split from
		case r >= 0x20 && r <= 0x7e:
			b.WriteRune(r)
		case asciiSpelling[r] != "":
			b.WriteString(asciiSpelling[r])
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}
