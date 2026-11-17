/**
 * Справочник полей и кодов Битрикс24.
 * Все данные берутся через BX24.callMethod (REST от имени текущего пользователя).
 */
(function () {
    'use strict';

    // =====================================================================
    //  Утилиты
    // =====================================================================
    var $ = function (id) { return document.getElementById(id); };

    function esc(s) {
        return (s === null || s === undefined ? '' : String(s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function yes(v) { return v === true || v === 'Y' || v === 'y' || v === 1 || v === '1'; }
    function num(v) { var n = parseFloat(v); return isNaN(n) ? (v === undefined ? null : v) : n; }

    function pickLabel(v) {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
            var langs = ['ru', 'ua', 'en'];
            for (var i = 0; i < langs.length; i++) if (v[langs[i]]) return v[langs[i]];
            for (var k in v) if (v[k] && typeof v[k] === 'string') return v[k];
        }
        return '';
    }

    function toast(text) {
        var t = $('toast');
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { t.classList.remove('show'); }, 1600);
    }

    /** Копирование: сначала execCommand (надёжно работает в iframe), затем Clipboard API. */
    function copyText(text) {
        var ok = false;
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);

        var short = text.length > 60 ? text.slice(0, 60) + '…' : text;
        if (ok) { toast('Скопировано: ' + short.replace(/\s+/g, ' ')); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { toast('Скопировано: ' + short.replace(/\s+/g, ' ')); },
                function () { toast('Не удалось скопировать — браузер запретил доступ к буферу'); }
            );
        } else {
            toast('Не удалось скопировать');
        }
    }

    // =====================================================================
    //  REST
    // =====================================================================
    function errText(res) {
        var e = res.error();
        if (!e) return '';
        if (e.ex) return (e.ex.error || '') + (e.ex.error_description ? ': ' + e.ex.error_description : '');
        return String(e);
    }

    /** Один вызов метода. */
    function call(method, params) {
        return new Promise(function (resolve, reject) {
            BX24.callMethod(method, params || {}, function (res) {
                if (res.error()) reject(new Error(method + ' → ' + errText(res)));
                else resolve(res.data());
            });
        });
    }

    /** Вызов с постраничной догрузкой (по 50 записей). pick — достаёт массив из ответа. */
    function callAll(method, params, pick) {
        pick = pick || function (d) { return d; };
        return new Promise(function (resolve, reject) {
            var acc = [];
            BX24.callMethod(method, params || {}, function (res) {
                if (res.error()) { reject(new Error(method + ' → ' + errText(res))); return; }
                var part = pick(res.data());
                if (Array.isArray(part)) acc = acc.concat(part);
                else if (part && typeof part === 'object') acc = acc.concat(Object.keys(part).map(function (k) { return part[k]; }));
                if (res.more()) res.next();
                else resolve(acc);
            });
        });
    }

    // =====================================================================
    //  Колонки
    // =====================================================================
    var COL = {
        code:     { key: 'code', title: 'Код', copy: true, mono: true },
        title:    { key: 'title', title: 'Название', copy: true },
        type:     { key: 'type', title: 'Тип', mono: true },
        required: { key: 'required', title: 'Обяз.', bool: true },
        multiple: { key: 'multiple', title: 'Множ.', bool: true },
        readonly: { key: 'readonly', title: 'Только чтение', bool: true },
        extra:    { key: 'extra', title: 'Доп.', parts: true }
    };

    function fieldColumns(opts) {
        opts = opts || {};
        var cols = [];
        if (opts.entity) cols.push({ key: 'entity', title: 'Сущность', gotoKey: '_src' });
        cols.push(COL.code);
        if (opts.alt) cols.push({ key: 'altCode', title: opts.altTitle || 'Доп. код', copy: true, mono: true });
        cols.push(COL.title, COL.type, COL.required, COL.multiple, COL.readonly, COL.extra);
        return cols;
    }

    // =====================================================================
    //  Нормализация полей
    // =====================================================================

    /** Ответ crm.*.fields и crm.item.fields → строки таблицы. */
    function crmFieldRows(fields) {
        fields = fields || {};
        return Object.keys(fields).map(function (key) {
            var f = fields[key] || {};
            var code = f.upperName || key;
            var title = pickLabel(f.formLabel) || pickLabel(f.listLabel) || pickLabel(f.filterLabel) || pickLabel(f.title) || key;
            var extra = [];

            if (f.statusType) extra.push({ t: 'справочник ' + f.statusType, goto: 'status:' + f.statusType });
            if (Array.isArray(f.items) && f.items.length) extra.push({ t: 'вариантов: ' + f.items.length });

            var s = f.settings;
            if (s && typeof s === 'object' && !Array.isArray(s)) {
                if (f.type === 'crm' || f.type === 'crm_entity') {
                    var ents = Object.keys(s).filter(function (k) { return s[k] === 'Y'; });
                    if (ents.length) extra.push({ t: 'привязка: ' + ents.join(', ') });
                }
                if (s.IBLOCK_ID) extra.push({ t: 'инфоблок ' + s.IBLOCK_ID });
                if (s.parentEntityTypeId) extra.push({ t: 'родитель entityTypeId ' + s.parentEntityTypeId });
            }
            if (f.isImmutable) extra.push({ t: 'задаётся только при создании' });

            return {
                code: code,
                altCode: code !== key ? key : '',
                title: title,
                type: f.type || '',
                required: !!f.isRequired,
                multiple: !!f.isMultiple,
                readonly: !!f.isReadOnly,
                custom: /^UF_/.test(code) || !!f.isDynamic,
                extra: extra,
                details: {
                    items: (f.items || []).map(function (i) { return { id: i.ID, value: i.VALUE, xml: i.XML_ID }; }),
                    raw: f
                }
            };
        });
    }

    /** Пользовательское поле из *.userfield.list → строка. */
    function userFieldRow(u) {
        var list = Array.isArray(u.LIST) ? u.LIST : [];
        var extra = [];
        if (list.length) extra.push({ t: 'вариантов: ' + list.length });
        return {
            code: u.FIELD_NAME,
            altCode: '',
            title: pickLabel(u.EDIT_FORM_LABEL) || pickLabel(u.LIST_COLUMN_LABEL) || u.FIELD_NAME,
            type: u.USER_TYPE_ID || '',
            required: yes(u.MANDATORY),
            multiple: yes(u.MULTIPLE),
            readonly: null,
            custom: true,
            extra: extra,
            details: { items: list.map(function (i) { return { id: i.ID, value: i.VALUE, xml: i.XML_ID }; }), raw: u }
        };
    }

    /** Ответ вида {CODE: 'Название'} → строки. */
    function mapRows(map) {
        return Object.keys(map || {}).map(function (k) {
            var v = map[k];
            return {
                code: k, altCode: '',
                title: typeof v === 'string' ? v : (pickLabel(v && v.title) || ''),
                type: (v && v.type) || '',
                required: null, multiple: null, readonly: null,
                custom: /^UF_/.test(k),
                extra: [],
                details: typeof v === 'object' ? { raw: v } : null
            };
        });
    }

    /** Добавляет/обновляет строки по коду (для полей + пользовательских полей). */
    function mergeRows(base, add) {
        var idx = {};
        base.forEach(function (r, i) { idx[r.code] = i; });
        add.forEach(function (r) {
            if (idx[r.code] !== undefined) {
                var old = base[idx[r.code]];
                if (old.title && old.title !== r.code && r.title === r.code) r.title = old.title;
                base[idx[r.code]] = r;
            } else {
                base.push(r);
            }
        });
        return base;
    }

    /** Поля списка (lists.field.get) → строки. */
    function listFieldRows(obj) {
        return Object.keys(obj || {}).map(function (k) {
            var f = obj[k] || {};
            var items = [];
            var dv = f.DISPLAY_VALUES_FORM;
            if (dv && typeof dv === 'object') {
                Object.keys(dv).forEach(function (id) { items.push({ id: id, value: dv[id] }); });
            }
            var extra = [];
            if (items.length) extra.push({ t: 'вариантов: ' + items.length });
            if (f.LINK_IBLOCK_ID) extra.push({ t: 'привязка к инфоблоку ' + f.LINK_IBLOCK_ID });
            return {
                code: f.FIELD_ID || k,
                altCode: f.CODE || '',
                title: f.NAME || '',
                type: f.TYPE || '',
                required: yes(f.IS_REQUIRED),
                multiple: yes(f.MULTIPLE),
                readonly: null,
                custom: /^PROPERTY_/.test(f.FIELD_ID || k),
                extra: extra,
                details: { items: items, raw: f }
            };
        });
    }

    // =====================================================================
    //  Справочники
    // =====================================================================
    var SEM = { S: 'успех', F: 'провал', P: 'в работе', success: 'успех', failure: 'провал', apology: 'провал', process: 'в работе' };
    var statusTypes = {};   // ENTITY_ID → описание из crm.status.entity.types
    var smartTypes = [];    // из crm.type.list

    function statusRows(list) {
        return list.map(function (s) {
            var ex = s.EXTRA || {};
            var semRaw = s.SEMANTICS || ex.SEMANTICS || '';
            var t = statusTypes[s.ENTITY_ID];
            var sem = SEM[semRaw] || semRaw || (t && t.SEMANTIC_INFO ? 'в работе' : '');
            var color = s.COLOR || ex.COLOR || '';
            return {
                code: s.STATUS_ID,
                title: s.NAME,
                entity: s.ENTITY_ID,
                entityName: t ? t.NAME : '',
                sort: num(s.SORT),
                semantics: sem,
                color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '',
                system: yes(s.SYSTEM),
                id: num(s.ID),
                details: { raw: s }
            };
        });
    }

    function statusColumns(all) {
        var cols = [
            { key: 'code', title: 'Код (STATUS_ID)', copy: true, mono: true },
            { key: 'title', title: 'Название', copy: true },
            { key: 'entity', title: 'ENTITY_ID', copy: true, mono: true }
        ];
        if (all) cols.push({ key: 'entityName', title: 'Справочник', gotoKey: '_goto' });
        cols.push(
            { key: 'sort', title: 'Сорт.', num: true },
            { key: 'semantics', title: 'Семантика' },
            { key: 'color', title: 'Цвет', color: true },
            { key: 'system', title: 'Системный', bool: true },
            { key: 'id', title: 'ID', num: true, mono: true }
        );
        return cols;
    }

    var CATEGORY_COLS = [
        { key: 'code', title: 'ID воронки', copy: true, mono: true },
        { key: 'title', title: 'Название', copy: true },
        { key: 'sort', title: 'Сорт.', num: true },
        { key: 'isDefault', title: 'По умолч.', bool: true },
        { key: 'stageEntity', title: 'ENTITY_ID стадий', copy: true, mono: true, gotoKey: '_goto' },
        { key: 'stagePrefix', title: 'Префикс STAGE_ID', copy: true, mono: true }
    ];

    async function loadDealCategories() {
        var cats;
        try {
            cats = (await callAll('crm.category.list', { entityTypeId: 2 }, function (d) { return d.categories; }))
                .map(function (c) { return { id: +c.id, name: c.name, sort: c.sort, isDefault: yes(c.isDefault), raw: c }; });
        } catch (e) {
            // старые коробки: crm.category.* нет
            var list = await callAll('crm.dealcategory.list', { order: { SORT: 'ASC' } });
            var def = { ID: 0, NAME: 'Общая' };
            try { def = await call('crm.dealcategory.default.get'); } catch (e2) { /* нет — оставим «Общая» */ }
            cats = [{ id: 0, name: def.NAME, sort: def.SORT, isDefault: true, raw: def }].concat(
                list.map(function (c) { return { id: +c.ID, name: c.NAME, sort: c.SORT, isDefault: false, raw: c }; })
            );
        }
        return cats.map(function (c) {
            var ent = c.id === 0 ? 'DEAL_STAGE' : 'DEAL_STAGE_' + c.id;
            return {
                code: String(c.id), title: c.name, sort: num(c.sort), isDefault: c.isDefault,
                stageEntity: ent, stagePrefix: c.id === 0 ? '— (без префикса)' : 'C' + c.id + ':',
                _goto: 'status:' + ent, details: { raw: c.raw }
            };
        });
    }

    async function loadSmartCategories() {
        var types = smartTypes.map(function (t) { return { etid: t.entityTypeId, title: t.title }; });
        types.push({ etid: 31, title: 'Счета (новые)' });
        var rows = [];
        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            var cats;
            try {
                cats = await callAll('crm.category.list', { entityTypeId: t.etid }, function (d) { return d.categories; });
            } catch (e) {
                continue;
            }
            cats.forEach(function (c) {
                var ent = t.etid === 31 ? 'SMART_INVOICE_STAGE_' + c.id : 'DYNAMIC_' + t.etid + '_STAGE_' + c.id;
                rows.push({
                    smart: t.title, smartId: t.etid,
                    code: String(c.id), title: c.name, sort: num(c.sort), isDefault: yes(c.isDefault),
                    stageEntity: ent, stagePrefix: 'DT' + t.etid + '_' + c.id + ':',
                    _goto: 'status:' + ent, _src: 'item:' + t.etid, details: { raw: c }
                });
            });
        }
        return rows;
    }

    /** Универсальная таблица из массива объектов (crm.enum.* и т.п.). */
    async function genericTable(method, params, pick) {
        var list = await callAll(method, params || {}, pick);
        var keys = [];
        list.forEach(function (o) {
            Object.keys(o || {}).forEach(function (k) {
                if (keys.indexOf(k) < 0 && (o[k] === null || typeof o[k] !== 'object')) keys.push(k);
            });
        });
        var rows = list.map(function (o) {
            var r = { details: { raw: o } };
            keys.forEach(function (k) { r[k] = o[k]; });
            r.code = o.ID !== undefined ? o.ID : o[keys[0]];
            return r;
        });
        var columns = keys.map(function (k) {
            return { key: k, title: k, copy: true, mono: /ID$|CODE|^TYPE/.test(k), num: k === 'SORT' };
        });
        return { columns: columns, rows: rows };
    }

    // =====================================================================
    //  Источники (то, что выбирается в селекте)
    // =====================================================================
    var sources = [];
    var byId = {};

    function addSource(s) {
        if (byId[s.id]) return;
        sources.push(s);
        byId[s.id] = s;
    }

    var CRM_FIELD_METHODS = [
        ['lead', 'Лиды', 'crm.lead.fields'],
        ['deal', 'Сделки', 'crm.deal.fields'],
        ['contact', 'Контакты', 'crm.contact.fields'],
        ['company', 'Компании', 'crm.company.fields'],
        ['quote', 'Предложения', 'crm.quote.fields'],
        ['invoice', 'Счета (старые)', 'crm.invoice.fields'],
        ['activity', 'Дела', 'crm.activity.fields'],
        ['product', 'Товары', 'crm.product.fields'],
        ['productsection', 'Разделы товаров', 'crm.productsection.fields'],
        ['productrow', 'Товарные позиции', 'crm.productrow.fields'],
        ['requisite', 'Реквизиты', 'crm.requisite.fields'],
        ['bankdetail', 'Банковские реквизиты', 'crm.requisite.bankdetail.fields'],
        ['address', 'Адреса', 'crm.address.fields'],
        ['currency', 'Валюты', 'crm.currency.fields']
    ];

    function buildStaticSources() {
        var G = 'Поля CRM';
        CRM_FIELD_METHODS.forEach(function (m) {
            addSource({
                id: 'f:' + m[0], group: G, title: m[1], method: m[2], kind: 'fields',
                load: async function () { return { columns: fieldColumns(), rows: crmFieldRows(await call(m[2])) }; }
            });
        });

        G = 'Поля: прочее';
        addSource({
            id: 'f:user', group: G, title: 'Пользователи', method: 'user.fields + user.userfield.list', kind: 'fields',
            load: async function () {
                var rows = mapRows(await call('user.fields'));
                try { mergeRows(rows, (await callAll('user.userfield.list', {})).map(userFieldRow)); } catch (e) { /* нет прав */ }
                return { columns: fieldColumns(), rows: rows };
            }
        });
        addSource({
            id: 'f:task', group: G, title: 'Задачи', method: 'tasks.task.getFields + task.item.userfield.getlist', kind: 'fields',
            load: async function () {
                var d = await call('tasks.task.getFields');
                var rows = mapRows(d.fields || d);
                try { mergeRows(rows, (await callAll('task.item.userfield.getlist', {})).map(userFieldRow)); } catch (e) { /* нет */ }
                return { columns: fieldColumns(), rows: rows };
            }
        });
        addSource({
            id: 'f:department', group: G, title: 'Подразделения', method: 'department.fields', kind: 'fields',
            load: async function () { return { columns: fieldColumns(), rows: mapRows(await call('department.fields')) }; }
        });

        G = 'Воронки и смарт-процессы';
        addSource({
            id: 'cat:deal', group: G, title: 'Воронки сделок', method: 'crm.category.list (entityTypeId=2)', kind: 'dict',
            load: async function () { return { columns: CATEGORY_COLS, rows: await loadDealCategories() }; }
        });
        addSource({
            id: 'cat:smart', group: G, title: 'Воронки смарт-процессов', method: 'crm.category.list', kind: 'dict',
            load: async function () {
                var cols = [{ key: 'smart', title: 'Смарт-процесс', gotoKey: '_src' }, { key: 'smartId', title: 'entityTypeId', copy: true, mono: true, num: true }].concat(CATEGORY_COLS);
                return { columns: cols, rows: await loadSmartCategories() };
            }
        });
        addSource({
            id: 'smart:list', group: G, title: 'Смарт-процессы (список)', method: 'crm.type.list', kind: 'dict',
            load: async function () {
                var types = await callAll('crm.type.list', {}, function (d) { return d.types; });
                return {
                    columns: [
                        { key: 'code', title: 'entityTypeId', copy: true, mono: true, num: true, gotoKey: '_goto' },
                        { key: 'title', title: 'Название', copy: true },
                        { key: 'id', title: 'ID типа', copy: true, mono: true, num: true },
                        { key: 'symCode', title: 'Символьный код', copy: true, mono: true },
                        { key: 'ufPrefix', title: 'Префикс польз. полей', copy: true, mono: true },
                        { key: 'stages', title: 'ENTITY_ID стадий', copy: true, mono: true },
                        { key: 'cats', title: 'Воронки', bool: true }
                    ],
                    rows: types.map(function (t) {
                        return {
                            code: t.entityTypeId, title: t.title, id: t.id, symCode: t.code || '',
                            ufPrefix: 'UF_CRM_' + t.id + '_', stages: 'DYNAMIC_' + t.entityTypeId + '_STAGE_{ID воронки}',
                            cats: yes(t.isCategoriesEnabled), _goto: 'item:' + t.entityTypeId, details: { raw: t }
                        };
                    })
                };
            }
        });

        G = 'Справочники (crm.status.list)';
        addSource({
            id: 'status:*', group: G, title: '★ Все стадии и справочники одной таблицей', method: 'crm.status.list', kind: 'dict',
            load: async function () {
                var list = await callAll('crm.status.list', { order: { ENTITY_ID: 'ASC', SORT: 'ASC' } });
                var rows = statusRows(list);
                rows.forEach(function (r) { r._goto = 'status:' + r.entity; });
                return { columns: statusColumns(true), rows: rows };
            }
        });
        addSource({
            id: 'status:types', group: G, title: '★ Типы справочников', method: 'crm.status.entity.types', kind: 'dict',
            load: async function () {
                var list = await callAll('crm.status.entity.types', {});
                return {
                    columns: [
                        { key: 'code', title: 'ENTITY_ID', copy: true, mono: true, gotoKey: '_goto' },
                        { key: 'title', title: 'Название', copy: true },
                        { key: 'entityTypeId', title: 'ENTITY_TYPE_ID', mono: true, num: true },
                        { key: 'categoryId', title: 'CATEGORY_ID', mono: true, num: true },
                        { key: 'prefix', title: 'PREFIX', copy: true, mono: true },
                        { key: 'stage', title: 'Стадии', bool: true }
                    ],
                    rows: list.map(function (t) {
                        return {
                            code: t.ID, title: t.NAME, entityTypeId: num(t.ENTITY_TYPE_ID), categoryId: num(t.CATEGORY_ID),
                            prefix: t.PREFIX || '', stage: !!t.SEMANTIC_INFO, _goto: 'status:' + t.ID, details: { raw: t }
                        };
                    })
                };
            }
        });

        G = 'Дела';
        [
            ['crm.enum.activitytype', 'Типы дел'],
            ['crm.enum.activitystatus', 'Статусы дел'],
            ['crm.enum.activitydirection', 'Направления дел'],
            ['crm.enum.activitypriority', 'Приоритеты дел'],
            ['crm.enum.activitynotifytype', 'Типы напоминаний'],
            ['crm.activity.type.list', 'Пользовательские типы дел (REST)']
        ].forEach(function (m) {
            addSource({ id: 'enum:' + m[0], group: G, title: m[1], method: m[0], kind: 'dict', load: function () { return genericTable(m[0]); } });
        });

        G = 'Прочее';
        [
            ['crm.enum.ownertype', 'Типы сущностей CRM (ENTITY_TYPE_ID)'],
            ['crm.enum.contenttype', 'Типы контента'],
            ['crm.enum.addresstype', 'Типы адресов'],
            ['crm.currency.list', 'Валюты (список)']
        ].forEach(function (m) {
            addSource({ id: 'enum:' + m[0], group: G, title: m[1], method: m[0], kind: 'dict', load: function () { return genericTable(m[0]); } });
        });
        addSource({
            id: 'enum:lists', group: G, title: 'Универсальные списки', method: 'lists.get', kind: 'dict',
            load: function () { return genericTable('lists.get', { IBLOCK_TYPE_ID: 'lists' }); }
        });
    }

    /** Динамические источники: смарт-процессы, списки, типы справочников. */
    async function buildDynamicSources() {
        var problems = [];

        // Смарт-процессы
        try {
            smartTypes = await callAll('crm.type.list', {}, function (d) { return d.types; });
        } catch (e) { problems.push('смарт-процессы: ' + e.message); }
        var smartItems = smartTypes.map(function (t) { return { etid: t.entityTypeId, title: t.title }; });
        smartItems.push({ etid: 31, title: 'Счета (новые)' });
        smartItems.forEach(function (t) {
            addSource({
                id: 'item:' + t.etid, group: 'Поля смарт-процессов', title: t.title + ' (' + t.etid + ')',
                method: 'crm.item.fields (entityTypeId=' + t.etid + ')', kind: 'fields',
                load: async function () {
                    var d = await call('crm.item.fields', { entityTypeId: t.etid });
                    return { columns: fieldColumns({ alt: true, altTitle: 'Код в crm.item.*' }), rows: crmFieldRows(d.fields || d) };
                }
            });
        });

        // Универсальные списки + бизнес-процессы
        var iblockTypes = [['lists', 'Поля списков'], ['bitrix_processes', 'Поля процессов (ленты)']];
        for (var i = 0; i < iblockTypes.length; i++) {
            var type = iblockTypes[i][0], group = iblockTypes[i][1];
            try {
                var lists = await callAll('lists.get', { IBLOCK_TYPE_ID: type });
                lists.forEach(function (l) {
                    addSource({
                        id: 'list:' + l.ID, group: group, title: l.NAME + ' (ID ' + l.ID + ')',
                        method: 'lists.field.get (IBLOCK_TYPE_ID=' + type + ', IBLOCK_ID=' + l.ID + ')', kind: 'fields',
                        load: async function () {
                            var d = await call('lists.field.get', { IBLOCK_TYPE_ID: type, IBLOCK_ID: l.ID });
                            return { columns: fieldColumns({ alt: true, altTitle: 'Символьный код' }), rows: listFieldRows(d) };
                        }
                    });
                });
            } catch (e) {
                if (type === 'lists') problems.push('списки: ' + e.message);
            }
        }

        // Типы справочников crm.status
        try {
            var types = await callAll('crm.status.entity.types', {});
            types.forEach(function (t) {
                statusTypes[t.ID] = t;
                addSource({
                    id: 'status:' + t.ID, group: 'Справочники (crm.status.list)', title: t.NAME + ' — ' + t.ID,
                    method: 'crm.status.list (ENTITY_ID=' + t.ID + ')', kind: 'dict',
                    load: async function () {
                        var list = await callAll('crm.status.list', { order: { SORT: 'ASC' }, filter: { ENTITY_ID: t.ID } });
                        return { columns: statusColumns(false), rows: statusRows(list) };
                    }
                });
            });
        } catch (e) { problems.push('типы справочников: ' + e.message); }

        return problems;
    }

    // =====================================================================
    //  Загрузка и кэш таблиц
    // =====================================================================
    var cache = {};
    var rowSeq = 0;

    function prepare(table) {
        table.rows.forEach(function (r) {
            r._k = ++rowSeq;
            r._search = table.columns.map(function (c) { return plain(r[c.key]); }).join('\u0001').toLowerCase()
                + '\u0001' + plain(r.altCode).toLowerCase();
        });
        return table;
    }

    function plain(v) {
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) return v.map(function (p) { return p.t; }).join('; ');
        if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
        return String(v);
    }

    function getTable(src) {
        if (!cache[src.id]) {
            cache[src.id] = Promise.resolve().then(src.load).then(prepare);
            cache[src.id].catch(function () { delete cache[src.id]; });
        }
        return cache[src.id];
    }

    // =====================================================================
    //  Состояние и отрисовка
    // =====================================================================
    var state = {
        src: null,          // текущий источник
        columns: [],
        rows: [],
        global: false,      // режим «во всех полях»
        sortKey: null,
        sortDir: 1,
        open: {},           // раскрытые строки
        view: [],
        token: 0
    };

    function q() { return $('q').value.trim().toLowerCase(); }

    function hl(text) {
        text = text === null || text === undefined ? '' : String(text);
        var needle = q();
        if (!needle) return esc(text);
        var low = text.toLowerCase(), out = '', pos = 0, i;
        while ((i = low.indexOf(needle, pos)) >= 0) {
            out += esc(text.slice(pos, i)) + '<mark>' + esc(text.slice(i, i + needle.length)) + '</mark>';
            pos = i + needle.length;
        }
        return out + esc(text.slice(pos));
    }

    function cmp(a, b) {
        var an = a === null || a === undefined || a === '', bn = b === null || b === undefined || b === '';
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        if (typeof a === 'boolean' || typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return plain(a).localeCompare(plain(b), 'ru', { numeric: true, sensitivity: 'base' });
    }

    function computeView() {
        var needle = q();
        var onlyCustom = $('onlyCustom').checked && !$('customWrap').classList.contains('hidden');
        var view = state.rows.filter(function (r) {
            if (onlyCustom && !r.custom) return false;
            return !needle || r._search.indexOf(needle) >= 0;
        });
        if (state.sortKey) {
            var k = state.sortKey, d = state.sortDir;
            view.sort(function (a, b) {
                // пустые значения всегда внизу
                var r = cmp(a[k], b[k]);
                var aEmpty = a[k] === null || a[k] === undefined || a[k] === '';
                var bEmpty = b[k] === null || b[k] === undefined || b[k] === '';
                return aEmpty || bEmpty ? r : r * d;
            });
        }
        return view;
    }

    function cell(col, r) {
        var v = r[col.key];
        var cls = (col.mono ? 'mono ' : '') + (col.num ? 'num ' : '');

        if (col.bool) {
            if (v === null || v === undefined) return '<td class="c dim">—</td>';
            return '<td class="c ' + (v ? 'yes' : 'no') + '">' + (v ? 'Да' : 'Нет') + '</td>';
        }
        if (col.parts) {
            return '<td>' + (v || []).map(function (p) {
                return p.goto
                    ? '<a href="#" data-goto="' + esc(p.goto) + '">' + hl(p.t) + '</a>'
                    : '<span>' + hl(p.t) + '</span>';
            }).join('<br>') + '</td>';
        }
        if (col.color) {
            return v ? '<td class="mono"><span class="sw" style="background:' + esc(v) + '"></span>' + hl(v) + '</td>' : '<td></td>';
        }

        var s = v === null || v === undefined ? '' : String(v);
        var inner = hl(s);
        var go = col.gotoKey && r[col.gotoKey] && byId[r[col.gotoKey]] ? r[col.gotoKey] : null;

        if (col.copy && s !== '') {
            inner = '<span class="cp" data-copy="' + esc(s) + '" title="Нажмите, чтобы скопировать">' + inner + '</span>';
            if (go) inner += '<a href="#" class="go" data-goto="' + esc(go) + '" title="Открыть">→</a>';
        } else if (go) {
            inner = '<a href="#" data-goto="' + esc(go) + '" data-q="' + esc(state.global ? r.code : '') + '">' + inner + '</a>';
        }
        return '<td class="' + cls + '">' + inner + '</td>';
    }

    function detailsHtml(r) {
        var d = r.details || {};
        var h = '';
        if (d.items && d.items.length) {
            var hasXml = d.items.some(function (i) { return i.xml; });
            h += '<div class="det-title">Варианты значений</div><table class="mini"><tr><th>ID</th><th>Значение</th>' + (hasXml ? '<th>XML_ID</th>' : '') + '</tr>';
            d.items.forEach(function (i) {
                h += '<tr><td class="mono"><span class="cp" data-copy="' + esc(i.id) + '">' + esc(i.id) + '</span></td>'
                    + '<td><span class="cp" data-copy="' + esc(i.value) + '">' + esc(i.value) + '</span></td>'
                    + (hasXml ? '<td class="mono">' + (i.xml ? '<span class="cp" data-copy="' + esc(i.xml) + '">' + esc(i.xml) + '</span>' : '') + '</td>' : '')
                    + '</tr>';
            });
            h += '</table>';
        }
        if (d.raw) {
            var json = JSON.stringify(d.raw, null, 2);
            h += '<div class="det-title">Как отдаёт REST (JSON)<button class="btn sm" data-copy="' + esc(json) + '">Копировать JSON</button></div>'
                + '<pre>' + esc(json) + '</pre>';
        }
        return h || '<span class="dim">Нет дополнительных данных</span>';
    }

    function render() {
        var cols = state.columns;
        var view = computeView();
        state.view = view;

        var h = '<table class="grid"><thead><tr>';
        cols.forEach(function (c) {
            var arr = state.sortKey === c.key ? '<span class="arr">' + (state.sortDir > 0 ? '▲' : '▼') + '</span>' : '';
            h += '<th data-key="' + esc(c.key) + '">' + esc(c.title) + arr + '</th>';
        });
        h += '</tr></thead><tbody>';

        if (!view.length) {
            h += '<tr><td colspan="' + cols.length + '" class="msg">Ничего не найдено</td></tr>';
        }
        view.forEach(function (r) {
            var hasD = !!r.details;
            var isOpen = hasD && state.open[r._k];
            h += '<tr data-k="' + r._k + '" class="' + (hasD ? 'has-d' : '') + (isOpen ? ' open' : '') + '">';
            cols.forEach(function (c, i) {
                var td = cell(c, r);
                if (i === 0 && hasD) td = td.replace(/^<td([^>]*)>/, '<td$1><span class="car">▶</span>');
                h += td;
            });
            h += '</tr>';
            if (isOpen) h += '<tr class="det"><td colspan="' + cols.length + '">' + detailsHtml(r) + '</td></tr>';
        });
        h += '</tbody></table>';

        $('wrap').innerHTML = h;
        renderInfo();
    }

    function renderInfo(extra) {
        var s = state.src;
        var parts = [];
        if (state.global) parts.push('<span><b>Поиск по полям всех сущностей</b></span>');
        else if (s) parts.push('<span>Метод: <b class="mono"><span class="cp" data-copy="' + esc(s.method.split(' ')[0]) + '">' + esc(s.method) + '</span></b></span>');
        parts.push('<span>Показано: <b>' + state.view.length + '</b> из ' + state.rows.length + '</span>');
        if (state.rows.length) parts.push('<span>Клик по коду/названию — копировать, по строке — подробности</span>');
        if (extra) parts.push(extra);
        $('info').innerHTML = parts.join('');
    }

    function showMessage(text, isErr) {
        $('wrap').innerHTML = '<div class="msg' + (isErr ? ' err' : '') + '">' + esc(text) + '</div>';
    }

    function updateControls() {
        var isFields = state.global || (state.src && state.src.kind === 'fields');
        $('customWrap').classList.toggle('hidden', !isFields);
    }

    // =====================================================================
    //  Действия
    // =====================================================================
    async function openSource(id, query) {
        var src = byId[id];
        if (!src) { toast('Не найдено: ' + id); return; }
        var token = ++state.token;

        state.global = false;
        $('global').checked = false;
        $('src').value = id;
        if (query !== undefined && query !== null) $('q').value = query;
        state.src = src;
        state.sortKey = null;
        state.open = {};
        updateControls();
        try { localStorage.setItem('b24fv:last', id); } catch (e) { /* storage недоступен */ }

        showMessage('Загрузка: ' + src.title + '…');
        $('info').innerHTML = '';
        try {
            var t = await getTable(src);
            if (token !== state.token) return;
            state.columns = t.columns;
            state.rows = t.rows;
            render();
        } catch (e) {
            if (token !== state.token) return;
            state.columns = []; state.rows = []; state.view = [];
            showMessage('Ошибка: ' + e.message + '\n\nВозможно, у приложения нет нужного права (scope) или метод недоступен в этой версии Битрикс24.', true);
            renderInfo();
        }
    }

    async function runGlobal() {
        var token = ++state.token;
        state.global = true;
        state.sortKey = null;
        state.open = {};
        updateControls();

        var list = sources.filter(function (s) { return s.kind === 'fields'; });
        var all = [], errors = [];
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!cache[s.id]) showMessage('Загрузка полей: ' + (i + 1) + ' из ' + list.length + ' — ' + s.title + '…');
            try {
                var t = await getTable(s);
                t.rows.forEach(function (r) {
                    var copy = Object.assign({}, r, { entity: s.title, _src: s.id });
                    all.push(copy);
                });
            } catch (e) {
                errors.push(s.title);
            }
            if (token !== state.token) return;
        }
        state.columns = fieldColumns({ entity: true, alt: true, altTitle: 'Доп. код' });
        state.rows = prepare({ columns: state.columns, rows: all }).rows;
        render();
        if (errors.length) renderInfo('<span class="err" title="' + esc(errors.join(', ')) + '">Не загрузилось: ' + errors.length + '</span>');
    }

    function refresh() {
        if (state.global) runGlobal();
        else if (state.src) openSource(state.src.id);
    }

    function copyTable() {
        if (!state.view.length) { toast('Нечего копировать'); return; }
        var cols = state.columns;
        var lines = [cols.map(function (c) { return c.title; }).join('\t')];
        state.view.forEach(function (r) {
            lines.push(cols.map(function (c) { return plain(r[c.key]).replace(/[\t\r\n]+/g, ' '); }).join('\t'));
        });
        copyText(lines.join('\n'));
    }

    function fillSelect() {
        var groups = [];
        var byGroup = {};
        sources.forEach(function (s) {
            if (!byGroup[s.group]) { byGroup[s.group] = []; groups.push(s.group); }
            byGroup[s.group].push(s);
        });
        var order = ['Поля CRM', 'Поля смарт-процессов', 'Поля списков', 'Поля процессов (ленты)', 'Поля: прочее',
            'Воронки и смарт-процессы', 'Справочники (crm.status.list)', 'Дела', 'Прочее'];
        groups.sort(function (a, b) {
            var ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        var h = '';
        groups.forEach(function (g) {
            h += '<optgroup label="' + esc(g) + '">';
            byGroup[g].forEach(function (s) { h += '<option value="' + esc(s.id) + '">' + esc(s.title) + '</option>'; });
            h += '</optgroup>';
        });
        $('src').innerHTML = h;
    }

    // =====================================================================
    //  События
    // =====================================================================
    function bind() {
        $('src').addEventListener('change', function () { openSource(this.value); });

        var timer;
        $('q').addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () { if (state.columns.length) render(); }, 120);
        });
        $('q').addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { this.value = ''; if (state.columns.length) render(); }
        });

        $('global').addEventListener('change', function () {
            if (this.checked) { runGlobal(); $('q').focus(); }
            else if (state.src) openSource(state.src.id);
        });
        $('onlyCustom').addEventListener('change', function () { if (state.columns.length) render(); });
        $('copyTable').addEventListener('click', copyTable);
        $('reload').addEventListener('click', function () { cache = {}; refresh(); toast('Кэш сброшен'); });

        document.addEventListener('click', function (e) {
            var t = e.target;

            var cp = t.closest('[data-copy]');
            if (cp) { e.preventDefault(); e.stopPropagation(); copyText(cp.getAttribute('data-copy')); return; }

            var go = t.closest('[data-goto]');
            if (go) {
                e.preventDefault();
                var gq = go.getAttribute('data-q');
                openSource(go.getAttribute('data-goto'), gq ? gq : '');
                return;
            }

            var th = t.closest('th[data-key]');
            if (th && th.closest('table.grid')) {
                var k = th.getAttribute('data-key');
                if (state.sortKey === k) {
                    if (state.sortDir > 0) state.sortDir = -1;
                    else { state.sortKey = null; state.sortDir = 1; }
                } else { state.sortKey = k; state.sortDir = 1; }
                render();
                return;
            }

            var tr = t.closest('tr.has-d');
            if (tr && !(window.getSelection && String(window.getSelection()))) {
                var key = tr.getAttribute('data-k');
                if (state.open[key]) delete state.open[key]; else state.open[key] = true;
                render();
            }
        });

        // «/» — фокус в поиск
        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); }
        });
    }

    // =====================================================================
    //  Старт
    // =====================================================================
    var started = false;

    setTimeout(function () {
        if (!started) showMessage('Не удалось подключиться к Битрикс24. Откройте приложение из интерфейса портала (раздел «Приложения»).', true);
    }, 5000);

    if (typeof BX24 === 'undefined') {
        showMessage('Не загрузилась библиотека BX24 (//api.bitrix24.com/api/v1/). Проверьте доступ к интернету с компьютера.', true);
        return;
    }

    BX24.init(async function () {
        started = true;
        bind();
        buildStaticSources();
        showMessage('Загрузка списка сущностей…');
        var problems = await buildDynamicSources();
        fillSelect();

        var last = null;
        try { last = localStorage.getItem('b24fv:last'); } catch (e) { /* нет storage */ }
        await openSource(last && byId[last] ? last : 'f:deal');

        if (problems.length) {
            renderInfo('<span class="err" title="' + esc(problems.join('\n')) + '">Часть разделов недоступна (наведите для подробностей)</span>');
        }
    });
})();
