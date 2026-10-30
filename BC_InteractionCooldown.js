/*:
 * @plugindesc v1.1.0 Per-event Action Button interaction cooldowns.
 * @author HumanNinjaToo
 *
 * @param Default Cooldown
 * @type number
 * @min 0
 * @decimals 0
 * @default 0
 * @desc Frames used when the active page has no valid cooldown comment tag.
 *
 * @param Enable Cooldowns
 * @type boolean
 * @default true
 * @desc Enable Action Button cooldowns in playtests and deployed games.
 *
 * @param Default Cooldown Mode
 * @type select
 * @option Start
 * @value Start
 * @option Completion
 * @value Completion
 * @default Completion
 * @desc Start timing at execution start or after the entire event completes.
 *
 * @help
 * BC_InteractionCooldown v1.1.0
 * Engine: RPG Maker MV 1.6.1+
 *
 * Installation:
 * Copy BC_InteractionCooldown.js into your project's js/plugins folder,
 * then enable BC_InteractionCooldown in the Plugin Manager.
 * Keep the original filename. No dependencies or plugin commands.
 *
 * Configuration:
 * Add a Comment on the desired event page:
 *   <InteractionCooldown: 60>
 *   <InteractionCooldownMode: Completion>
 *
 * Tags are case-insensitive and override their corresponding plugin
 * defaults. Missing or invalid tags use the plugin defaults.
 * <InteractionCooldown: 0> disables the cooldown for that event page.
 *
 * Supported Events:
 * Only Action Button events are affected. Touch triggers, Autorun,
 * and Parallel Process events are unaffected.
 *
 * Cooldown Modes:
 * Start: Cooldown begins when the event starts executing.
 * Completion: Cooldown begins after the entire event finishes.
 * Use Start for activation-based timing and Completion to prevent
 * immediate reactivation after dialogue or other event commands.
 * Cooldowns are measured in frames and pause while menus are open.
 *
 * Additional Information:
 * Event page changes preserve active cooldowns. New page settings
 * apply to subsequent interactions.
 * Cooldowns persist through normal saves and loads on the same map,
 * but may reset when leaving and returning to a map.
 * Saving during an unfinished Completion-mode event is unsupported.
 *
 * Compatibility:
 * Plugins that modify event activation or execution may cause conflicts.
 *
 * Changelog:
 * 1.1.0 - Added Start/Completion modes, Default Cooldown Mode parameter,
 * InteractionCooldownMode tag, and completion tracking.
 * 1.0.0 - Initial release.
 */
(function BC_InteractionCooldown_ninja() {
    'use strict';
    var parameters = PluginManager.parameters('BC_InteractionCooldown');
    if (parameters['Enable Cooldowns'] === 'false') return;
    var defaultFrames = Number(parameters['Default Cooldown'] || 0);
    if (!Number.isSafeInteger(defaultFrames) || defaultFrames < 0) defaultFrames = 0;
    var defaultMode = String(parameters['Default Cooldown Mode'] || '').trim().toLowerCase();
    defaultMode = defaultMode === 'start' ? 'start' : 'completion';
    var playerInteraction = false;
    // Runtime-only records: no event references or pending execution in saves.
    var completions = new WeakMap();

    function clock_ninja() {
        return $gameMap._bcInteractionFrame_ninja || 0;
    }

    function readPage_ninja(event) {
        var frames = defaultFrames;
        var mode = defaultMode;
        var page = event.page();
        var list = page && page.list;
        if (list) {
            for (var i = 0; i < list.length; i++) {
                var command = list[i];
                if (command.code !== 108 && command.code !== 408) continue;
                var text = command.parameters && command.parameters[0];
                if (typeof text !== 'string') continue;
                var pattern = /<\s*InteractionCooldown\s*:\s*(\d+)\s*>/gi;
                var match;
                while ((match = pattern.exec(text))) {
                    var value = Number(match[1]);
                    if (Number.isSafeInteger(value)) frames = value;
                }
                pattern = /<\s*InteractionCooldownMode\s*:\s*(Start|Completion)\s*>/gi;
                while ((match = pattern.exec(text))) mode = match[1].toLowerCase();
            }
        }
        event._bcInteractionDuration_ninja = frames;
        event._bcInteractionMode_ninja = mode;
    }

    var setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function setupPage_ninja() {
        delete this._bcInteractionPending_ninja;
        var result = setupPage.apply(this, arguments);
        readPage_ninja(this);
        return result;
    };

    var update = Game_Map.prototype.update;
    Game_Map.prototype.update = function update_ninja(sceneActive) {
        if (sceneActive) this._bcInteractionFrame_ninja = (this._bcInteractionFrame_ninja || 0) + 1;
        return update.apply(this, arguments);
    };

    var startMapEvent = Game_Player.prototype.startMapEvent;
    Game_Player.prototype.startMapEvent = function startMapEvent_ninja() {
        var previous = playerInteraction;
        playerInteraction = true;
        try {
            return startMapEvent.apply(this, arguments);
        } finally {
            playerInteraction = previous;
        }
    };

    var start = Game_Event.prototype.start;
    Game_Event.prototype.start = function start_ninja() {
        var eligible = playerInteraction && this.isTriggerIn([0]);
        if (eligible && (this._bcInteractionDuration_ninja === undefined ||
                this._bcInteractionMode_ninja === undefined)) readPage_ninja(this);
        var duration = eligible ? this._bcInteractionDuration_ninja : 0;
        if (duration > 0 && clock_ninja() < (this._bcInteractionUntil_ninja || 0)) return;
        var wasStarting = this.isStarting();
        var result = start.apply(this, arguments);
        if (eligible && !wasStarting && this.isStarting()) {
            this._bcInteractionPending_ninja = {
                duration: duration, mode: this._bcInteractionMode_ninja
            };
        }
        return result;
    };

    var setup = Game_Interpreter.prototype.setup;
    Game_Interpreter.prototype.setup = function setup_ninja(list, eventId) {
        var result = setup.apply(this, arguments);
        if (this === $gameMap._interpreter && eventId > 0) {
            var event = $gameMap.event(eventId);
            if (event && event._bcInteractionPending_ninja !== undefined) {
                var pending = event._bcInteractionPending_ninja;
                delete event._bcInteractionPending_ninja;
                // Numeric pending values from v1.0.0 retain Start semantics.
                if (typeof pending === 'number') pending = { duration: pending, mode: 'start' };
                if (pending.duration > 0 && list === event.list() && this.isRunning()) {
                    if (pending.mode === 'start') {
                        event._bcInteractionUntil_ninja = clock_ninja() + pending.duration;
                    } else {
                        completions.set(this, { event: event, map: $gameMap,
                            mapId: $gameMap.mapId(), duration: pending.duration });
                    }
                }
            }
        }
        return result;
    };

    var clear = Game_Interpreter.prototype.clear;
    Game_Interpreter.prototype.clear = function clear_ninja() {
        completions.delete(this);
        return clear.apply(this, arguments);
    };

    var executeCommand = Game_Interpreter.prototype.executeCommand;
    Game_Interpreter.prototype.executeCommand = function executeCommand_ninja() {
        var pending = completions.get(this);
        // Native executeCommand calls terminate only when no command remains.
        // Do not classify terminate calls made by a script mid-list as completion.
        var atEnd = this._list && this._index >= this._list.length &&
            !this._childInterpreter && !this._waitCount && !this._waitMode;
        var result = executeCommand.apply(this, arguments);
        if (pending && !this.isRunning()) {
            completions.delete(this);
            if (atEnd && this === $gameMap._interpreter && pending.map === $gameMap &&
                    pending.mapId === $gameMap.mapId() &&
                    $gameMap.event(this.eventId()) === pending.event) {
                pending.event._bcInteractionUntil_ninja = clock_ninja() + pending.duration;
            }
        }
        return result;
    };
})();
