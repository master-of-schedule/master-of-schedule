import downloadTemplate from '../assets/user-guide/download-template.png';
import uploadPlan from '../assets/user-guide/upload-plan.png';
import planGrade from '../assets/user-guide/plan-grade.png';
import deleteClass from '../assets/user-guide/delete-class.png';
import copyClass from '../assets/user-guide/copy-class.png';
import addClass from '../assets/user-guide/add-class.png';
import addSubject from '../assets/user-guide/add-subject.png';
import createDepartment from '../assets/user-guide/create-department.png';
import addDepartmentTable from '../assets/user-guide/add-department-table.png';
import teachers from '../assets/user-guide/teachers.png';
import assignments from '../assets/user-guide/assignments.png';
import selectSubjects from '../assets/user-guide/select-subjects.png';
import groupAssignment from '../assets/user-guide/group-assignment.png';
import checkWorkload from '../assets/user-guide/check-workload.png';
import unassignedList from '../assets/user-guide/unassigned-list.png';

export type GuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'note'; text: string }
  | { type: 'ordered'; items: string[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'imageRow'; images: { src: string; alt: string }[] };

export interface GuideSection {
  id: string;
  title: string;
  subtitle?: string;
  blocks: GuideBlock[];
}

export const userGuideSections: GuideSection[] = [
  {
    id: 'intro',
    title: 'Вступление',
    blocks: [
      {
        type: 'paragraph',
        text: 'Редактор нагрузки - бесплатное приложение, которое помогает распределить учебную нагрузку по кафедрам и учителям.',
      },
      {
        type: 'paragraph',
        text: 'РН не сделает вашу работу за вас, но с его помощью вы сделаете свою работу точнее и быстрее.',
      },
      {
        type: 'paragraph',
        text: 'Приложение бывает в двух вариантах: десктопная версия для macOS и Windows и веб-версия, которая открывается в браузере и не требует постоянного доступа к интернету.',
      },
      {
        type: 'paragraph',
        text: 'Актуальные версии можно скачать на странице программы: https://master-of-schedule.github.io/#download',
      },
    ],
  },
  {
    id: 'before-start',
    title: 'Перед началом работы',
    subtitle: 'Подготовьте и загрузите файл учебного плана школы в формате Excel.',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Скачайте шаблон из РН.',
          'Прочитайте в скачанном файле инструкцию по оформлению.',
          'Заполните учебный план в файле Excel.',
          'Загрузите учебный план.',
        ],
      },
      {
        type: 'imageRow',
        images: [
          { src: downloadTemplate, alt: 'Кнопка скачивания шаблона учебного плана' },
          { src: uploadPlan, alt: 'Область загрузки учебного плана' },
        ],
      },
    ],
  },
  {
    id: 'plan',
    title: 'Работа с учебным планом',
    subtitle: 'Существующие классы и предметы',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Откройте учебный план параллели.',
          'Укажите делимость каждого класса на группы: 1 - не делится, 2 - делится.',
          'Укажите делимость предметных уроков на группы: галочка означает, что занятие делится.',
          'При необходимости отредактируйте краткие названия предметов в столбце «Кратко». Эти названия будут использоваться в таблицах.',
        ],
      },
      { type: 'image', src: planGrade, alt: 'Открытый учебный план параллели' },
      {
        type: 'note',
        text: 'При указании делимости занятия щелчок по квадратику меняет занятия с этим названием во всех параллелях, а кнопка «только эту» меняет только выбранную параллель.',
      },
    ],
  },
  {
    id: 'classes',
    title: 'Изменение списка классов',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Чтобы удалить класс, нажмите крестик рядом с его названием.',
          'Чтобы добавить класс копированием существующего, нажмите кнопку копирования рядом с классом.',
          'Чтобы добавить класс без нагрузки, используйте кнопку «+ Класс».',
        ],
      },
      {
        type: 'imageRow',
        images: [
          { src: deleteClass, alt: 'Удаление класса' },
          { src: copyClass, alt: 'Копирование класса' },
          { src: addClass, alt: 'Добавление класса без нагрузки' },
        ],
      },
    ],
  },
  {
    id: 'subjects',
    title: 'Изменение списка предметов',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Чтобы удалить предмет, нажмите крестик в строке предмета.',
          'Чтобы добавить предмет, используйте кнопку «+ Предмет».',
        ],
      },
      { type: 'image', src: addSubject, alt: 'Добавление предмета в учебном плане' },
    ],
  },
  {
    id: 'departments',
    title: 'Распределение предметов по кафедрам',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Создайте кафедру.',
          'Добавьте учителей и предметы. После ввода ФИО учителя подтвердите ввод клавишей Enter или кнопкой «Добавить».',
          'При необходимости добавьте ещё одну или несколько таблиц для той же кафедры.',
        ],
      },
      {
        type: 'imageRow',
        images: [
          { src: createDepartment, alt: 'Создание кафедры' },
          { src: addDepartmentTable, alt: 'Добавление таблицы внутри кафедры' },
        ],
      },
    ],
  },
  {
    id: 'teachers',
    title: 'Список учителей',
    blocks: [
      {
        type: 'paragraph',
        text: 'На вкладке «Учителя» хранится общий список учителей. Основной способ добавить учителя - через вкладку «Кафедры», но здесь можно уточнить кабинет, инициалы, классное руководство или добавить учителя без кафедры.',
      },
      {
        type: 'paragraph',
        text: 'Здесь же указывается классное руководство.',
      },
      { type: 'image', src: teachers, alt: 'Список учителей' },
    ],
  },
  {
    id: 'assignments',
    title: 'Распределение нагрузки по учителям',
    subtitle: 'Авторитарный вариант',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Выберите в верхнем меню «Назначения».',
          'Выберите кафедру.',
          'Щелчок по крестику на пересечении учителя и класса назначает учителю предмет или предметы выбранной таблицы.',
          'Если предметов несколько, можно снять часть галочек, чтобы назначить предметы другому учителю.',
          'Если класс делится на группы, можно назначить обе группы одному учителю. Занятия будут проводиться в разное время.',
          'Кнопка «Проверить нагрузку» открывает список нераспределённых занятий.',
        ],
      },
      { type: 'image', src: assignments, alt: 'Вкладка назначений нагрузки' },
      {
        type: 'imageRow',
        images: [
          { src: selectSubjects, alt: 'Выбор части предметов для назначения' },
          { src: groupAssignment, alt: 'Назначение обеих групп одному учителю' },
        ],
      },
      {
        type: 'imageRow',
        images: [
          { src: checkWorkload, alt: 'Кнопка проверки нагрузки' },
          { src: unassignedList, alt: 'Список нераспределённых занятий' },
        ],
      },
      {
        type: 'paragraph',
        text: 'Когда список нераспределённых занятий опустеет, останется указать классных руководителей на соответствующей вкладке.',
      },
    ],
  },
  {
    id: 'department-exchange',
    title: 'Коллегиальный вариант',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Выберите в верхнем меню «Экспорт».',
          'Найдите панель «Обмен с кафедрами».',
          'Выберите кафедру из раскрывающегося списка.',
          'Нажмите кнопку «Выгрузить файл завуча» и сохраните файл в выбранной папке.',
          'Передайте завкафедрой файл программы и выгруженный файл кафедры вида нагрузка_Филологи.json.',
          'Завкафедрой распределяет нагрузку по учителям кафедры и возвращает файл вида нагрузка_Филологи_для_завуча.json.',
          'На панели «Обмен с кафедрами» нажмите кнопку «Импортировать файл кафедры» и выберите полученный файл.',
        ],
      },
    ],
  },
  {
    id: 'export',
    title: 'Экспорт результатов',
    blocks: [
      {
        type: 'ordered',
        items: [
          'Кнопка «Скачать занятия.xlsx» выгружает файл Excel со списком занятий для Редактора школьного расписания.',
          'Панель «Форма нагрузки» выводит общую нагрузку школы.',
          'Панель «Обмен с кафедрами» - «Печатать нагрузку кафедры» выводит нагрузку по кафедрам.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Успешной работы!',
      },
    ],
  },
];
