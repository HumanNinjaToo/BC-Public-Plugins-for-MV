/*:
 * @plugindesc v1.1.0 Warns about blocked forced event movement during playtests.
 * @author HumanNinjaToo
 *
 * @param Enable Warnings
 * @type boolean
 * @default true
 * @desc Enable console warnings during playtests.
 *
 * @param Warn on Skippable Routes
 * @type boolean
 * @default false
 * @desc Also warn when Skip If Cannot Move is enabled.
 *
 * @param Warning Cooldown
 * @type number
 * @min 0
 * @decimals 0
 * @default 60
 * @desc Frames between identical warnings. 0 reports every failure.
 *
 * @help
 * BC_MoveRouteWarning 1.1.0
 * Engine: RPG Maker MV 1.6.1+
 *
 * Installation:
 * Copy BC_MoveRouteWarning.js into your project's js/plugins folder,
 * then enable BC_MoveRouteWarning in the Plugin Manager.
 * Keep the original filename. No dependencies, plugin commands,
 * notetags, or additional assets.
 *
 * Detection:
 * Detects failed movement commands (1-13) in forced event movement routes.
 * Includes directional movement, Random, Toward/Away from Player,
 * and Forward/Backward movement.
 * Does not affect movement behavior or monitor autonomous movement,
 * player movement, or followers.
 *
 * Console Output:
 * Open the developer console (F8) during playtesting to see warnings:
 * [BC_MoveRouteWarning] Map 8 | Event 12 (Guard) | Position (15, 9) |
 * Move Right BLOCKED | Route Command 4 | Skip: OFF
 * Route Command identifies the zero-based movement route index.
 *
 * Configuration:
 * Enable Warnings: Enables or disables movement diagnostics.
 * Warn on Skippable Routes: Reports failures even when
 * Skip If Cannot Move is enabled. Disabled by default.
 * Warning Cooldown: Minimum frames between repeated warnings.
 * Default is 60 frames; 0 reports every failure.
 *
 * Playtest Only:
 * Diagnostics run only during playtesting and are automatically
 * disabled in deployed games. Safe to leave installed for deployment.
 *
 * Limitations:
 * A BLOCKED warning indicates a failed movement command,
 * not necessarily that the event is trapped or unable to reach its target.
 * The plugin does not identify collision causes or correct movement.
 * Plugins that modify native movement processing may cause conflicts.
 *
 * Changelog:
 * 1.1.0 - Added diagnostics for commands 9-13.
 * 1.0.0 - Initial release.
 */
(function BC_MoveRouteWarning_ninja() {
    'use strict';

    var parameters = PluginManager.parameters('BC_MoveRouteWarning');
    if (parameters['Enable Warnings'] === 'false' ||
            !Utils.isOptionValid('test')) return;

    var warnSkippable = parameters['Warn on Skippable Routes'] === 'true';
    var cooldown = Number(parameters['Warning Cooldown'] === undefined ?
        60 : parameters['Warning Cooldown']);
    cooldown = isFinite(cooldown) ? Math.max(0, Math.floor(cooldown)) : 60;
    var directions = [null, 'Down', 'Left', 'Right', 'Up',
        'Lower Left', 'Lower Right', 'Upper Left', 'Upper Right',
        'Random', 'Toward Player', 'Away from Player', 'Forward', 'Backward'];
    // No properties are added to game objects or retained strongly across maps.
    var history = new WeakMap();
    var original = Game_Character.prototype.processMoveCommand;

    Game_Character.prototype.processMoveCommand = function processMoveCommand_ninja(command) {
        if (!$gameTemp || !$gameTemp.isPlaytest() ||
                !(this instanceof Game_Event) || !this.isMoveRouteForcing() ||
                !command || !Number.isInteger(command.code) ||
                command.code < 1 || command.code > 13 || !this._moveRoute ||
                (this._moveRoute.skippable && !warnSkippable)) {
            return original.apply(this, arguments);
        }

        var route = this._moveRoute;
        var index = this._moveRouteIndex;
        // Only label a position when it actually references this command.
        var hasIndex = Number.isInteger(index) && index >= 0 &&
            route.list && route.list[index] === command;
        var code = command.code;
        var skip = !!route.skippable;
        var result = original.apply(this, arguments);
        if (this.isMovementSucceeded() !== false) return result;

        var frame = Graphics.frameCount;
        var state = history.get(this);
        if (!state || state.route !== route) {
            state = { route: route, entries: Object.create(null) };
            history.set(this, state);
        }
        var key = code + ':' + (hasIndex ? index : '?');
        var entries = state.entries;
        Object.keys(entries).forEach(function cleanupCooldowns_ninja(k) {
            if (frame < entries[k] || frame - entries[k] >= cooldown) {
                delete entries[k];
            }
        });
        if (cooldown > 0 && entries[key] !== undefined) return result;
        if (cooldown > 0) entries[key] = frame;

        var data = this.event();
        var message = '[BC_MoveRouteWarning] Map ' + $gameMap.mapId() +
            ' | Event ' + this.eventId() +
            (data && data.name ? ' (' + data.name + ')' : '') +
            ' | Position (' + this.x + ', ' + this.y + ')' +
            ' | Move ' + directions[code] + ' BLOCKED';
        if (hasIndex) message += ' | Route Command ' + index;
        message += ' | Skip: ' + (skip ? 'ON' : 'OFF');
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(message);
        }
        return result;
    };
})();
