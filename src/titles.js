// Title clean-up and food / non-food detection used by the frames.

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
// Dates seen in titles: "20th December'26", "Feb '26", "30 Nov '26", "20/12/2026", "Dec 2026".
const DATE = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s*${MONTH}\\s*'?\\s*\\d{2,4}|${MONTH}\\s*'?\\s*\\d{2,4}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})`;
const BB_PREFIX = new RegExp(`^\\s*[\\[(]?\\s*(?:best\\s*before|bbe?|exp(?:iry)?)\\s*:?\\s*${DATE}\\s*[\\])]?\\s*[-–—:|,]?\\s*`, 'i');
const BB_SUFFIX = new RegExp(`\\s*[-–—|,(\\[]*\\s*(?:best\\s*before|bbe?|exp(?:iry)?)\\s*:?\\s*${DATE}\\s*[\\])]?\\s*$`, 'i');

function cleanTitle(t, maxChars = 70) {
  let s = String(t || '').replace(BB_PREFIX, '').replace(BB_SUFFIX, '').replace(/\s+/g, ' ').trim();
  if (s.length > maxChars) s = s.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

// Product types that are clearly groceries. Anything else (toothpaste, henna, copper cups,
// statues, empty type) gets the theme's generic label instead of the food one.
const NON_FOOD = /beauty|health|hair|skin|care|cosmetic|toothpaste|soap|shampoo|henna|mehandi|household|kitchenware|utensil|cookware|puja|pooja|incense|agarbatti|decor|statue|idol|gift card|clothing|jewel|medicine|ayurved/i;
const FOOD = /snack|flour|atta|spice|herb|masala|rice|dal|lentil|pulse|bean|vegetable|fruit|frozen|fresh|sweet|mithai|tea|coffee|drink|beverage|juice|pickle|sauce|chutney|paste|oil|ghee|noodle|ready|instant|biscuit|cookie|rusk|bakery|bread|dairy|paneer|nut|cereal|sugar|jaggery|salt|papad|pasta|spread|honey|jam|seed|grocer|food|condiment|essence|baking|vermicelli|soup|cooking/i;

function isFood(type) {
  const t = String(type || '');
  return !!t && !NON_FOOD.test(t) && FOOD.test(t);
}

module.exports = { cleanTitle, isFood };
