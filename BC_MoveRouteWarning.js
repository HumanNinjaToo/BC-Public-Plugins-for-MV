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
 * Engine: RPG Maker MV 1.6.1+ (targets 1.6.1 and 1.6.2)
 *
 * Installation: Copy BC_MoveRouteWarning.js to your project's js/plugins
 * folder, then add and enable BC_MoveRouteWarning in the Plugin Manager.
 * Keep this filename. No dependencies, commands, notetags or extra assets.
 *
 * Reports failed Down, Left, Right, Up, Lower Left, Lower Right, Upper Left
 * and Upper Right, plus Random, Toward Player, Away from Player, Forward
 * and Backward commands (1-13) in forced map-event routes. Uses the engine's
 * movement-success flag after execution; never changes movement behavior.
 * Autonomous routes, players, followers, route Script commands, Wait, Turn,
 * Jump and other commands are not diagnosed.
 * Move Random may skip movement when its chosen direction is blocked;
 * MV leaves success true in that case, so no warning is produced.
 * Toward/Away warn only if the final native attempt fails, after any fallback.
 * When event and player overlap, Toward/Away do nothing and do not warn.
 *
 * Open the developer console to see warnings:
 * [BC_MoveRouteWarning] Map 8 | Event 12 (Guard) | Position (15, 9) |
 * Move Right BLOCKED | Route Command 4 | Skip: OFF
 * Route Command is the zero-based engine route-list index.
 *
 * Enable Warnings: temporarily disable all diagnostics.
 * Warn on Skippable Routes: defaults OFF; blocked movement is often
 * intentional when Skip If Cannot Move is enabled.
 * Warning Cooldown: defaults to 60 Graphics frames, per event, command
 * and route position. First failure warns immediately. 0 disables suppression.
 * Replacing a route starts fresh tracking. Expired entries are pruned.
 * Tracking uses weak event references and is not stored in saves; old map
 * events can be collected on transfer, including transfers to the same map.
 *
 * Playtest only: native test-option detection prevents installing movement
 * instrumentation in deployed games. $gameTemp.isPlaytest() is also checked
 * for each intercepted command. Safe to leave installed for deployment.
 *
 * Limitations: Does not identify the collision cause or fix blocked routes.
 * A BLOCKED warning means the native movement command reported failure.
 * It does not mean the event is completely surrounded, permanently stuck,
 * or unable to reach its destination through another route.
 * Move Toward/Away from Player uses basic directional movement, not full
 * pathfinding, so warnings may occur even when another valid route exists.
 * Third-party plugins must preserve processMoveCommand and the native
 * movement-success semantics. Place below plugins aliasing that method.
 * Plugins replacing movement processing may bypass or invalidate detection.
 * No compatibility claim is made for custom movement systems.
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
