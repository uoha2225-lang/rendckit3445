const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_SUPPORT_LABEL,
    buildTicketChannelTopic,
    hasTicketAdminAccess,
    parseTicketChannelTopic,
    resolveTicketRoute,
    resolveTicketRouteFromTopic,
} = require('./ticket-routing.js');

test('resolveTicketRoute uses type-specific roles before legacy fallback', () => {
    const route = resolveTicketRoute('ticket_inquiry', {
        TICKET_INQUIRY_ROLE_IDS: '111, 222',
        TICKET_ADMIN_ROLE_ID_1: '999',
        TICKET_ADMIN_ROLE_ID_2: '888',
    });

    assert.equal(route.displayName, 'استفسار');
    assert.deepEqual(route.roleIds, ['111', '222']);
    assert.equal(route.mentions, '<@&111> <@&222>');
    assert.equal(route.usedTypeSpecificRoles, true);
    assert.equal(route.usedLegacyFallback, false);
});

test('resolveTicketRoute falls back to legacy admin roles when type-specific roles are absent', () => {
    const route = resolveTicketRoute('ticket_inquiry', {
        TICKET_ADMIN_ROLE_ID_1: '999',
        TICKET_ADMIN_ROLE_ID_2: '888',
    });

    assert.deepEqual(route.roleIds, ['999', '888']);
    assert.equal(route.mentions, '<@&999> <@&888>');
    assert.equal(route.usedTypeSpecificRoles, false);
    assert.equal(route.usedLegacyFallback, true);
});

test('resolveTicketRoute returns neutral fallback text when no roles are configured', () => {
    const route = resolveTicketRoute('ticket_tech_support', {});

    assert.deepEqual(route.roleIds, []);
    assert.equal(route.mentions, DEFAULT_SUPPORT_LABEL);
    assert.equal(route.notificationTarget, DEFAULT_SUPPORT_LABEL);
});

test('resolveTicketRoute exposes the configured display name for every ticket type', () => {
    assert.equal(resolveTicketRoute('ticket_buy_product', {}).displayName, 'شراء منتج من المتجر');
    assert.equal(resolveTicketRoute('ticket_inquiry', {}).displayName, 'استفسار');
    assert.equal(resolveTicketRoute('ticket_tech_support', {}).displayName, 'طلب دعم فني');
});

test('topic helpers preserve owner and ticket type for new channels', () => {
    const topic = buildTicketChannelTopic('123456', 'ticket_inquiry');
    const parsed = parseTicketChannelTopic(topic);

    assert.equal(topic, 'Owner: 123456 | Type: inquiry');
    assert.deepEqual(parsed, {
        ownerId: '123456',
        topicType: 'inquiry',
        ticketType: 'ticket_inquiry',
    });
});

test('resolveTicketRouteFromTopic supports legacy owner-only topics', () => {
    const route = resolveTicketRouteFromTopic('Owner: 123456', {
        TICKET_ADMIN_ROLE_ID_1: '500',
    });

    assert.equal(route.ownerId, '123456');
    assert.equal(route.ticketType, null);
    assert.deepEqual(route.roleIds, ['500']);
    assert.equal(route.mentions, '<@&500>');
});

test('resolveTicketRouteFromTopic restores type-specific roles for typed ticket topics', () => {
    const route = resolveTicketRouteFromTopic('Owner: 123456 | Type: tech_support', {
        TICKET_TECH_SUPPORT_ROLE_IDS: '700,701',
        TICKET_ADMIN_ROLE_ID_1: '500',
    });

    assert.equal(route.ownerId, '123456');
    assert.equal(route.ticketType, 'ticket_tech_support');
    assert.equal(route.displayName, 'طلب دعم فني');
    assert.deepEqual(route.roleIds, ['700', '701']);
    assert.equal(route.notificationTarget, '<@&700> <@&701>');
});

test('hasTicketAdminAccess honors type-specific roles and administrator override', () => {
    const env = {
        TICKET_INQUIRY_ROLE_IDS: '111,222',
        TICKET_ADMIN_ROLE_ID_1: '999',
    };
    const topic = buildTicketChannelTopic('123456', 'ticket_inquiry');

    assert.equal(
        hasTicketAdminAccess({ memberRoleIds: ['222'], channelTopic: topic, env }),
        true,
    );

    assert.equal(
        hasTicketAdminAccess({ memberRoleIds: ['999'], channelTopic: topic, env }),
        false,
    );

    assert.equal(
        hasTicketAdminAccess({ memberRoleIds: [], channelTopic: topic, env, isAdministrator: true }),
        true,
    );
});

/* ══════════════════════════════════════════════
   اختبارات إعدادات فئة التذاكر
   ══════════════════════════════════════════════ */
const os   = require('node:os');
const path = require('node:path');
const fs   = require('node:fs');

// --- حفظ إعداد saveTicketCategorySettings ---

test('saveTicketCategorySettings saves categoryId without wiping logChannelId', () => {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
    const tmpFile = path.join(tmpDir, 'data', 'ticket-settings.json');

    // بناء نسخة مصغرة من الدوال المعنية
    const readSettings = () => {
        try { return JSON.parse(fs.readFileSync(tmpFile, 'utf-8')); } catch (_) { return {}; }
    };
    const saveCategory = (guildId, categoryId) => {
        const s = readSettings();
        s[guildId] = { ...s[guildId], categoryId };
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, JSON.stringify(s, null, 2), 'utf-8');
    };
    const saveLog = (guildId, logChannelId) => {
        const s = readSettings();
        s[guildId] = { ...s[guildId], logChannelId };
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, JSON.stringify(s, null, 2), 'utf-8');
    };

    saveLog('guild1', 'log-ch-1');
    saveCategory('guild1', 'cat-1');

    const result = readSettings();
    assert.equal(result['guild1'].logChannelId, 'log-ch-1');
    assert.equal(result['guild1'].categoryId, 'cat-1');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('saveTicketCategorySettings sets categoryId for a new guild', () => {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
    const tmpFile = path.join(tmpDir, 'data', 'ticket-settings.json');

    const readSettings  = () => { try { return JSON.parse(fs.readFileSync(tmpFile, 'utf-8')); } catch (_) { return {}; } };
    const saveCategory  = (guildId, categoryId) => {
        const s = readSettings();
        s[guildId] = { ...s[guildId], categoryId };
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, JSON.stringify(s, null, 2), 'utf-8');
    };

    saveCategory('guild-new', 'cat-99');
    const result = readSettings();
    assert.equal(result['guild-new'].categoryId, 'cat-99');
    assert.equal(result['guild-new'].logChannelId, undefined);

    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ticket category resolution: per-guild setting takes priority over env fallback', () => {
    const ticketCategories = new Map();
    ticketCategories.set('g1', 'cat-from-settings');

    const resolveCategory = (guildId, envCategoryId) =>
        ticketCategories.get(guildId) || envCategoryId || null;

    assert.equal(resolveCategory('g1', 'cat-from-env'), 'cat-from-settings');
});

test('ticket category resolution: falls back to env var when no per-guild setting exists', () => {
    const ticketCategories = new Map();

    const resolveCategory = (guildId, envCategoryId) =>
        ticketCategories.get(guildId) || envCategoryId || null;

    assert.equal(resolveCategory('g1', 'cat-from-env'), 'cat-from-env');
});

test('ticket category resolution: returns null when neither setting nor env var is set', () => {
    const ticketCategories = new Map();

    const resolveCategory = (guildId, envCategoryId) =>
        ticketCategories.get(guildId) || envCategoryId || null;

    assert.equal(resolveCategory('g1', undefined), null);
});

test('saving logChannelId after categoryId does not overwrite categoryId', () => {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
    const tmpFile = path.join(tmpDir, 'data', 'ticket-settings.json');

    const readSettings = () => { try { return JSON.parse(fs.readFileSync(tmpFile, 'utf-8')); } catch (_) { return {}; } };
    const save = (guildId, patch) => {
        const s = readSettings();
        s[guildId] = { ...s[guildId], ...patch };
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, JSON.stringify(s, null, 2), 'utf-8');
    };

    save('g2', { categoryId: 'cat-abc' });
    save('g2', { logChannelId: 'log-xyz' });

    const result = readSettings();
    assert.equal(result['g2'].categoryId,   'cat-abc');
    assert.equal(result['g2'].logChannelId, 'log-xyz');

    fs.rmSync(tmpDir, { recursive: true, force: true });
});
