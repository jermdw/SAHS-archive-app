// migration/compare_lists.js
import fs from 'fs';

const generatedText = fs.readFileSync('migration/missing_images_list.txt', 'utf8');
const generatedIds = generatedText.match(/^\d+/gm).map(id => parseInt(id, 10));

// Transcribed from images (ignoring struck through)
const handwrittenIds = [
  // Page 1
  95, 149, 303, 312, 313, 314, 316, 317, 318, 319, 321, 322, 323, 324, 325, 326, 327, 328, 329, 331, 333, 335, 337, 338, 339, 340, 341, 342, 346, 348, 368, 371, 374, 375, 376, 377, 380, 381, 383, 384, 394, 395, 400, 401, 408, 411, 413, 424, 436, 437, 440, 446, 450, 456, 459, 461, 462, 465, 466, 469, 470, 473, 474, 475, 476, 477, 478, 483, 484, 485, 486,
  // Page 2
  487, 488, 489, 491, 492, 493, 495, 498, 501, 502, 503, 504, 505, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 522, 523, 524, 525, 528, 529, 530, 531, 532, 533, 534, 536, 538, 539, 540, 543, 545, 546, 549, 551, 553, 554, 590, 591, 592, 593, 594, 595, 597, 603, 658, 661, 662, 666, 670, 671, 672, 673, 677, 682, 694, 696, 707, 709, 710, 713, 718, 721, 737, 739, 741, 750, 751, 752, 753, 754, 755, 758, 765, 769, 772, 774, 775, 778, 782, 784, 796, 849, 853, 864, 883, 884, 886, 962, 1184, 1055
];

const inGeneratedNotHandwritten = generatedIds.filter(id => !handwrittenIds.includes(id));
const inHandwrittenNotGenerated = handwrittenIds.filter(id => !generatedIds.includes(id));

console.log('--- In Generated List but NOT in Handwritten ---');
console.log(inGeneratedNotHandwritten.join(', '));

console.log('\n--- In Handwritten List but NOT in Generated ---');
console.log(inHandwrittenNotGenerated.join(', '));
