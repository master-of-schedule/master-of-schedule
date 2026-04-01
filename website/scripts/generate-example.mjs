/**
 * Generates a synthetic example data file for РШР import.
 * All names are fictional. Run: node website/scripts/generate-example.mjs
 * Output: website/public/example-data.xlsx
 */

import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/example-data.xlsx');

// ── Synthetic data ──────────────────────────────────────────────────────────

const TEACHERS = [
  { name: 'Иванов И.И.',    subjects: 'Математика, Алгебра',         bans: '' },
  { name: 'Петрова М.С.',   subjects: 'Русский язык, Литература',    bans: 'Пт: 7-8' },
  { name: 'Сидоров А.В.',   subjects: 'Физика',                      bans: '' },
  { name: 'Козлова Е.Н.',   subjects: 'Химия, Биология',             bans: 'Ср: 1-2' },
  { name: 'Новиков Д.П.',   subjects: 'История, Обществознание',     bans: '' },
  { name: 'Фёдорова О.Г.',  subjects: 'Иностранный язык (англ.)',    bans: 'Пн: 7-8' },
  { name: 'Морозов С.К.',   subjects: 'Информатика',                 bans: '' },
  { name: 'Волкова Т.Р.',   subjects: 'География',                   bans: 'Чт: 1' },
  { name: 'Зайцев В.А.',    subjects: 'Физическая культура',         bans: '' },
  { name: 'Орлова Н.В.',    subjects: 'Музыка, Изобразительное искусство', bans: '' },
  { name: 'Громов Е.Д.',    subjects: 'Технология',                  bans: 'Вт: 7-8' },
  { name: 'Белова А.П.',    subjects: 'Математика, Геометрия',       bans: '' },
];

const CLASSES = [
  ['5а'], ['5б'], ['5в'],
  ['6а'], ['6б'],
  ['7а'], ['7б'],
  ['8а'], ['8б'],
  ['9а'],
  ['10а'],
  ['11а'],
];

const ROOMS = [
  { full: 'Кабинет 101',         short: '101', capacity: 30 },
  { full: 'Кабинет 102',         short: '102', capacity: 30 },
  { full: 'Кабинет 201 (физика)',short: '201', capacity: 28 },
  { full: 'Кабинет 202 (химия)', short: '202', capacity: 26 },
  { full: 'Кабинет 203',        short: '203', capacity: 30 },
  { full: 'Кабинет 301 (инф.)',  short: '301', capacity: 16 },
  { full: 'Кабинет 302',        short: '302', capacity: 30 },
  { full: 'Спортивный зал',      short: 'Спортзал', capacity: 60 },
  { full: 'Актовый зал',         short: 'Актовый', capacity: 100 },
];

// Lesson requirements: class, subject, teacher, count per week
const LESSONS = [
  // 5а
  { class: '5а', subject: 'Математика',    teacher: 'Иванов И.И.',   count: 5 },
  { class: '5а', subject: 'Русский язык',  teacher: 'Петрова М.С.',  count: 5 },
  { class: '5а', subject: 'Литература',    teacher: 'Петрова М.С.',  count: 2 },
  { class: '5а', subject: 'История',       teacher: 'Новиков Д.П.', count: 2 },
  { class: '5а', subject: 'Иностранный язык (англ.)', teacher: 'Фёдорова О.Г.', count: 3 },
  { class: '5а', subject: 'Физическая культура', teacher: 'Зайцев В.А.', count: 3 },
  { class: '5а', subject: 'Музыка',        teacher: 'Орлова Н.В.',  count: 1 },
  { class: '5а', subject: 'Изобразительное искусство', teacher: 'Орлова Н.В.', count: 1 },
  { class: '5а', subject: 'Технология',    teacher: 'Громов Е.Д.',  count: 2 },
  // 5б
  { class: '5б', subject: 'Математика',    teacher: 'Белова А.П.',   count: 5 },
  { class: '5б', subject: 'Русский язык',  teacher: 'Петрова М.С.',  count: 5 },
  { class: '5б', subject: 'Литература',    teacher: 'Петрова М.С.',  count: 2 },
  { class: '5б', subject: 'История',       teacher: 'Новиков Д.П.', count: 2 },
  { class: '5б', subject: 'Иностранный язык (англ.)', teacher: 'Фёдорова О.Г.', count: 3 },
  { class: '5б', subject: 'Физическая культура', teacher: 'Зайцев В.А.', count: 3 },
  { class: '5б', subject: 'Музыка',        teacher: 'Орлова Н.В.',  count: 1 },
  { class: '5б', subject: 'Технология',    teacher: 'Громов Е.Д.',  count: 2 },
  // 8а
  { class: '8а', subject: 'Алгебра',       teacher: 'Иванов И.И.',   count: 3 },
  { class: '8а', subject: 'Геометрия',     teacher: 'Белова А.П.',   count: 2 },
  { class: '8а', subject: 'Русский язык',  teacher: 'Петрова М.С.',  count: 3 },
  { class: '8а', subject: 'Литература',    teacher: 'Петрова М.С.',  count: 2 },
  { class: '8а', subject: 'Физика',        teacher: 'Сидоров А.В.', count: 3 },
  { class: '8а', subject: 'Химия',         teacher: 'Козлова Е.Н.', count: 2 },
  { class: '8а', subject: 'История',       teacher: 'Новиков Д.П.', count: 2 },
  { class: '8а', subject: 'Обществознание',teacher: 'Новиков Д.П.', count: 1 },
  { class: '8а', subject: 'Иностранный язык (англ.)', teacher: 'Фёдорова О.Г.', count: 3 },
  { class: '8а', subject: 'Информатика',   teacher: 'Морозов С.К.', count: 2 },
  { class: '8а', subject: 'Физическая культура', teacher: 'Зайцев В.А.', count: 3 },
  // 11а
  { class: '11а', subject: 'Алгебра',      teacher: 'Иванов И.И.',   count: 3 },
  { class: '11а', subject: 'Геометрия',    teacher: 'Белова А.П.',   count: 2 },
  { class: '11а', subject: 'Физика',       teacher: 'Сидоров А.В.', count: 4 },
  { class: '11а', subject: 'Химия',        teacher: 'Козлова Е.Н.', count: 2 },
  { class: '11а', subject: 'Русский язык', teacher: 'Петрова М.С.',  count: 2 },
  { class: '11а', subject: 'Литература',   teacher: 'Петрова М.С.',  count: 3 },
  { class: '11а', subject: 'История',      teacher: 'Новиков Д.П.', count: 2 },
  { class: '11а', subject: 'Обществознание', teacher: 'Новиков Д.П.',count: 2 },
  { class: '11а', subject: 'Иностранный язык (англ.)', teacher: 'Фёдорова О.Г.', count: 3 },
  { class: '11а', subject: 'Информатика',  teacher: 'Морозов С.К.', count: 2 },
  { class: '11а', subject: 'Физическая культура', teacher: 'Зайцев В.А.', count: 2 },
];

// ── Build workbook ──────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

// Sheet: Учителя
const teachersData = [
  ['Фамилия И.О.', 'Предметы', 'Запреты'],
  ...TEACHERS.map((t) => [t.name, t.subjects, t.bans]),
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(teachersData), 'Учителя');

// Sheet: Классы
const classesData = [['Класс'], ...CLASSES];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classesData), 'Классы');

// Sheet: Кабинеты
const roomsData = [
  ['Кабинет', 'Краткое название', 'Вместимость'],
  ...ROOMS.map((r) => [r.full, r.short, r.capacity]),
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roomsData), 'Кабинеты');

// Sheet: Список занятий
const lessonsData = [
  ['Класс', 'Предмет', 'Учитель', 'Количество'],
  ...LESSONS.map((l) => [l.class, l.subject, l.teacher, l.count]),
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lessonsData), 'Список занятий');

XLSX.writeFile(wb, OUT);
console.log('Generated:', OUT);
