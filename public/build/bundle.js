
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || (anchor && node.nextSibling !== anchor)) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.3' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    const LOCATION = {};
    const ROUTER = {};

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    function getLocation(source) {
      return {
        ...source.location,
        state: source.history.state,
        key: (source.history.state && source.history.state.key) || "initial"
      };
    }

    function createHistory(source, options) {
      const listeners = [];
      let location = getLocation(source);

      return {
        get location() {
          return location;
        },

        listen(listener) {
          listeners.push(listener);

          const popstateListener = () => {
            location = getLocation(source);
            listener({ location, action: "POP" });
          };

          source.addEventListener("popstate", popstateListener);

          return () => {
            source.removeEventListener("popstate", popstateListener);

            const index = listeners.indexOf(listener);
            listeners.splice(index, 1);
          };
        },

        navigate(to, { state, replace = false } = {}) {
          state = { ...state, key: Date.now() + "" };
          // try...catch iOS Safari limits to 100 pushState calls
          try {
            if (replace) {
              source.history.replaceState(state, null, to);
            } else {
              source.history.pushState(state, null, to);
            }
          } catch (e) {
            source.location[replace ? "replace" : "assign"](to);
          }

          location = getLocation(source);
          listeners.forEach(listener => listener({ location, action: "PUSH" }));
        }
      };
    }

    // Stores history entries in memory for testing or other platforms like Native
    function createMemorySource(initialPathname = "/") {
      let index = 0;
      const stack = [{ pathname: initialPathname, search: "" }];
      const states = [];

      return {
        get location() {
          return stack[index];
        },
        addEventListener(name, fn) {},
        removeEventListener(name, fn) {},
        history: {
          get entries() {
            return stack;
          },
          get index() {
            return index;
          },
          get state() {
            return states[index];
          },
          pushState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            index++;
            stack.push({ pathname, search });
            states.push(state);
          },
          replaceState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            stack[index] = { pathname, search };
            states[index] = state;
          }
        }
      };
    }

    // Global history uses window.history as the source if available,
    // otherwise a memory history
    const canUseDOM = Boolean(
      typeof window !== "undefined" &&
        window.document &&
        window.document.createElement
    );
    const globalHistory = createHistory(canUseDOM ? window : createMemorySource());
    const { navigate } = globalHistory;

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    const paramRe = /^:(.+)/;

    const SEGMENT_POINTS = 4;
    const STATIC_POINTS = 3;
    const DYNAMIC_POINTS = 2;
    const SPLAT_PENALTY = 1;
    const ROOT_POINTS = 1;

    /**
     * Check if `string` starts with `search`
     * @param {string} string
     * @param {string} search
     * @return {boolean}
     */
    function startsWith(string, search) {
      return string.substr(0, search.length) === search;
    }

    /**
     * Check if `segment` is a root segment
     * @param {string} segment
     * @return {boolean}
     */
    function isRootSegment(segment) {
      return segment === "";
    }

    /**
     * Check if `segment` is a dynamic segment
     * @param {string} segment
     * @return {boolean}
     */
    function isDynamic(segment) {
      return paramRe.test(segment);
    }

    /**
     * Check if `segment` is a splat
     * @param {string} segment
     * @return {boolean}
     */
    function isSplat(segment) {
      return segment[0] === "*";
    }

    /**
     * Split up the URI into segments delimited by `/`
     * @param {string} uri
     * @return {string[]}
     */
    function segmentize(uri) {
      return (
        uri
          // Strip starting/ending `/`
          .replace(/(^\/+|\/+$)/g, "")
          .split("/")
      );
    }

    /**
     * Strip `str` of potential start and end `/`
     * @param {string} str
     * @return {string}
     */
    function stripSlashes(str) {
      return str.replace(/(^\/+|\/+$)/g, "");
    }

    /**
     * Score a route depending on how its individual segments look
     * @param {object} route
     * @param {number} index
     * @return {object}
     */
    function rankRoute(route, index) {
      const score = route.default
        ? 0
        : segmentize(route.path).reduce((score, segment) => {
            score += SEGMENT_POINTS;

            if (isRootSegment(segment)) {
              score += ROOT_POINTS;
            } else if (isDynamic(segment)) {
              score += DYNAMIC_POINTS;
            } else if (isSplat(segment)) {
              score -= SEGMENT_POINTS + SPLAT_PENALTY;
            } else {
              score += STATIC_POINTS;
            }

            return score;
          }, 0);

      return { route, score, index };
    }

    /**
     * Give a score to all routes and sort them on that
     * @param {object[]} routes
     * @return {object[]}
     */
    function rankRoutes(routes) {
      return (
        routes
          .map(rankRoute)
          // If two routes have the exact same score, we go by index instead
          .sort((a, b) =>
            a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
          )
      );
    }

    /**
     * Ranks and picks the best route to match. Each segment gets the highest
     * amount of points, then the type of segment gets an additional amount of
     * points where
     *
     *  static > dynamic > splat > root
     *
     * This way we don't have to worry about the order of our routes, let the
     * computers do it.
     *
     * A route looks like this
     *
     *  { path, default, value }
     *
     * And a returned match looks like:
     *
     *  { route, params, uri }
     *
     * @param {object[]} routes
     * @param {string} uri
     * @return {?object}
     */
    function pick(routes, uri) {
      let match;
      let default_;

      const [uriPathname] = uri.split("?");
      const uriSegments = segmentize(uriPathname);
      const isRootUri = uriSegments[0] === "";
      const ranked = rankRoutes(routes);

      for (let i = 0, l = ranked.length; i < l; i++) {
        const route = ranked[i].route;
        let missed = false;

        if (route.default) {
          default_ = {
            route,
            params: {},
            uri
          };
          continue;
        }

        const routeSegments = segmentize(route.path);
        const params = {};
        const max = Math.max(uriSegments.length, routeSegments.length);
        let index = 0;

        for (; index < max; index++) {
          const routeSegment = routeSegments[index];
          const uriSegment = uriSegments[index];

          if (routeSegment !== undefined && isSplat(routeSegment)) {
            // Hit a splat, just grab the rest, and return a match
            // uri:   /files/documents/work
            // route: /files/* or /files/*splatname
            const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

            params[splatName] = uriSegments
              .slice(index)
              .map(decodeURIComponent)
              .join("/");
            break;
          }

          if (uriSegment === undefined) {
            // URI is shorter than the route, no match
            // uri:   /users
            // route: /users/:userId
            missed = true;
            break;
          }

          let dynamicMatch = paramRe.exec(routeSegment);

          if (dynamicMatch && !isRootUri) {
            const value = decodeURIComponent(uriSegment);
            params[dynamicMatch[1]] = value;
          } else if (routeSegment !== uriSegment) {
            // Current segments don't match, not dynamic, not splat, so no match
            // uri:   /users/123/settings
            // route: /users/:id/profile
            missed = true;
            break;
          }
        }

        if (!missed) {
          match = {
            route,
            params,
            uri: "/" + uriSegments.slice(0, index).join("/")
          };
          break;
        }
      }

      return match || default_ || null;
    }

    /**
     * Check if the `path` matches the `uri`.
     * @param {string} path
     * @param {string} uri
     * @return {?object}
     */
    function match(route, uri) {
      return pick([route], uri);
    }

    /**
     * Add the query to the pathname if a query is given
     * @param {string} pathname
     * @param {string} [query]
     * @return {string}
     */
    function addQuery(pathname, query) {
      return pathname + (query ? `?${query}` : "");
    }

    /**
     * Resolve URIs as though every path is a directory, no files. Relative URIs
     * in the browser can feel awkward because not only can you be "in a directory",
     * you can be "at a file", too. For example:
     *
     *  browserSpecResolve('foo', '/bar/') => /bar/foo
     *  browserSpecResolve('foo', '/bar') => /foo
     *
     * But on the command line of a file system, it's not as complicated. You can't
     * `cd` from a file, only directories. This way, links have to know less about
     * their current path. To go deeper you can do this:
     *
     *  <Link to="deeper"/>
     *  // instead of
     *  <Link to=`{${props.uri}/deeper}`/>
     *
     * Just like `cd`, if you want to go deeper from the command line, you do this:
     *
     *  cd deeper
     *  # not
     *  cd $(pwd)/deeper
     *
     * By treating every path as a directory, linking to relative paths should
     * require less contextual information and (fingers crossed) be more intuitive.
     * @param {string} to
     * @param {string} base
     * @return {string}
     */
    function resolve(to, base) {
      // /foo/bar, /baz/qux => /foo/bar
      if (startsWith(to, "/")) {
        return to;
      }

      const [toPathname, toQuery] = to.split("?");
      const [basePathname] = base.split("?");
      const toSegments = segmentize(toPathname);
      const baseSegments = segmentize(basePathname);

      // ?a=b, /users?b=c => /users?a=b
      if (toSegments[0] === "") {
        return addQuery(basePathname, toQuery);
      }

      // profile, /users/789 => /users/789/profile
      if (!startsWith(toSegments[0], ".")) {
        const pathname = baseSegments.concat(toSegments).join("/");

        return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
      }

      // ./       , /users/123 => /users/123
      // ../      , /users/123 => /users
      // ../..    , /users/123 => /
      // ../../one, /a/b/c/d   => /a/b/one
      // .././one , /a/b/c/d   => /a/b/c/one
      const allSegments = baseSegments.concat(toSegments);
      const segments = [];

      allSegments.forEach(segment => {
        if (segment === "..") {
          segments.pop();
        } else if (segment !== ".") {
          segments.push(segment);
        }
      });

      return addQuery("/" + segments.join("/"), toQuery);
    }

    /**
     * Combines the `basepath` and the `path` into one path.
     * @param {string} basepath
     * @param {string} path
     */
    function combinePaths(basepath, path) {
      return `${stripSlashes(
    path === "/" ? basepath : `${stripSlashes(basepath)}/${stripSlashes(path)}`
  )}/`;
    }

    /**
     * Decides whether a given `event` should result in a navigation or not.
     * @param {object} event
     */
    function shouldNavigate(event) {
      return (
        !event.defaultPrevented &&
        event.button === 0 &&
        !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      );
    }

    /* node_modules/svelte-routing/src/Router.svelte generated by Svelte v3.38.3 */

    function create_fragment$c(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[8], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let $base;
    	let $location;
    	let $routes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Router", slots, ['default']);
    	let { basepath = "/" } = $$props;
    	let { url = null } = $$props;
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const routes = writable([]);
    	validate_store(routes, "routes");
    	component_subscribe($$self, routes, value => $$invalidate(7, $routes = value));
    	const activeRoute = writable(null);
    	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

    	// If locationContext is not set, this is the topmost Router in the tree.
    	// If the `url` prop is given we force the location to it.
    	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(6, $location = value));

    	// If routerContext is set, the routerBase of the parent Router
    	// will be the base for this Router's descendants.
    	// If routerContext is not set, the path and resolved uri will both
    	// have the value of the basepath prop.
    	const base = routerContext
    	? routerContext.routerBase
    	: writable({ path: basepath, uri: basepath });

    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(5, $base = value));

    	const routerBase = derived([base, activeRoute], ([base, activeRoute]) => {
    		// If there is no activeRoute, the routerBase will be identical to the base.
    		if (activeRoute === null) {
    			return base;
    		}

    		const { path: basepath } = base;
    		const { route, uri } = activeRoute;

    		// Remove the potential /* or /*splatname from
    		// the end of the child Routes relative paths.
    		const path = route.default
    		? basepath
    		: route.path.replace(/\*.*$/, "");

    		return { path, uri };
    	});

    	function registerRoute(route) {
    		const { path: basepath } = $base;
    		let { path } = route;

    		// We store the original path in the _path property so we can reuse
    		// it when the basepath changes. The only thing that matters is that
    		// the route reference is intact, so mutation is fine.
    		route._path = path;

    		route.path = combinePaths(basepath, path);

    		if (typeof window === "undefined") {
    			// In SSR we should set the activeRoute immediately if it is a match.
    			// If there are more Routes being registered after a match is found,
    			// we just skip them.
    			if (hasActiveRoute) {
    				return;
    			}

    			const matchingRoute = match(route, $location.pathname);

    			if (matchingRoute) {
    				activeRoute.set(matchingRoute);
    				hasActiveRoute = true;
    			}
    		} else {
    			routes.update(rs => {
    				rs.push(route);
    				return rs;
    			});
    		}
    	}

    	function unregisterRoute(route) {
    		routes.update(rs => {
    			const index = rs.indexOf(route);
    			rs.splice(index, 1);
    			return rs;
    		});
    	}

    	if (!locationContext) {
    		// The topmost Router in the tree is responsible for updating
    		// the location store and supplying it through context.
    		onMount(() => {
    			const unlisten = globalHistory.listen(history => {
    				location.set(history.location);
    			});

    			return unlisten;
    		});

    		setContext(LOCATION, location);
    	}

    	setContext(ROUTER, {
    		activeRoute,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute
    	});

    	const writable_props = ["basepath", "url"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("$$scope" in $$props) $$invalidate(8, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		setContext,
    		onMount,
    		writable,
    		derived,
    		LOCATION,
    		ROUTER,
    		globalHistory,
    		pick,
    		match,
    		stripSlashes,
    		combinePaths,
    		basepath,
    		url,
    		locationContext,
    		routerContext,
    		routes,
    		activeRoute,
    		hasActiveRoute,
    		location,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute,
    		$base,
    		$location,
    		$routes
    	});

    	$$self.$inject_state = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("hasActiveRoute" in $$props) hasActiveRoute = $$props.hasActiveRoute;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$base*/ 32) {
    			// This reactive statement will update all the Routes' path when
    			// the basepath changes.
    			{
    				const { path: basepath } = $base;

    				routes.update(rs => {
    					rs.forEach(r => r.path = combinePaths(basepath, r._path));
    					return rs;
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*$routes, $location*/ 192) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			{
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}
    	};

    	return [
    		routes,
    		location,
    		base,
    		basepath,
    		url,
    		$base,
    		$location,
    		$routes,
    		$$scope,
    		slots
    	];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { basepath: 3, url: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment$c.name
    		});
    	}

    	get basepath() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basepath(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get url() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-routing/src/Route.svelte generated by Svelte v3.38.3 */

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*routeParams*/ 4,
    	location: dirty & /*$location*/ 16
    });

    const get_default_slot_context = ctx => ({
    	params: /*routeParams*/ ctx[2],
    	location: /*$location*/ ctx[4]
    });

    // (40:0) {#if $activeRoute !== null && $activeRoute.route === route}
    function create_if_block$3(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1$3, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(40:0) {#if $activeRoute !== null && $activeRoute.route === route}",
    		ctx
    	});

    	return block;
    }

    // (43:2) {:else}
    function create_else_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope, routeParams, $location*/ 532)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], !current ? -1 : dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(43:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (41:2) {#if component !== null}
    function create_if_block_1$3(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[4] },
    		/*routeParams*/ ctx[2],
    		/*routeProps*/ ctx[3]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, routeParams, routeProps*/ 28)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 16 && { location: /*$location*/ ctx[4] },
    					dirty & /*routeParams*/ 4 && get_spread_object(/*routeParams*/ ctx[2]),
    					dirty & /*routeProps*/ 8 && get_spread_object(/*routeProps*/ ctx[3])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(41:2) {#if component !== null}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7] && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$activeRoute*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Route", slots, ['default']);
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	validate_store(activeRoute, "activeRoute");
    	component_subscribe($$self, activeRoute, value => $$invalidate(1, $activeRoute = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(4, $location = value));

    	const route = {
    		path,
    		// If no path prop is given, this Route will act as the default Route
    		// that is rendered if no other Route in the Router is a match.
    		default: path === ""
    	};

    	let routeParams = {};
    	let routeProps = {};
    	registerRoute(route);

    	// There is no need to unregister Routes in SSR since it will all be
    	// thrown away anyway.
    	if (typeof window !== "undefined") {
    		onDestroy(() => {
    			unregisterRoute(route);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("path" in $$new_props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		onDestroy,
    		ROUTER,
    		LOCATION,
    		path,
    		component,
    		registerRoute,
    		unregisterRoute,
    		activeRoute,
    		location,
    		route,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), $$new_props));
    		if ("path" in $$props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$props) $$invalidate(0, component = $$new_props.component);
    		if ("routeParams" in $$props) $$invalidate(2, routeParams = $$new_props.routeParams);
    		if ("routeProps" in $$props) $$invalidate(3, routeProps = $$new_props.routeProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$activeRoute*/ 2) {
    			if ($activeRoute && $activeRoute.route === route) {
    				$$invalidate(2, routeParams = $activeRoute.params);
    			}
    		}

    		{
    			const { path, component, ...rest } = $$props;
    			$$invalidate(3, routeProps = rest);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		$activeRoute,
    		routeParams,
    		routeProps,
    		$location,
    		activeRoute,
    		location,
    		route,
    		path,
    		$$scope,
    		slots
    	];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { path: 8, component: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment$b.name
    		});
    	}

    	get path() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set path(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get component() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-routing/src/Link.svelte generated by Svelte v3.38.3 */
    const file$9 = "node_modules/svelte-routing/src/Link.svelte";

    function create_fragment$a(ctx) {
    	let a;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[16].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);

    	let a_levels = [
    		{ href: /*href*/ ctx[0] },
    		{ "aria-current": /*ariaCurrent*/ ctx[2] },
    		/*props*/ ctx[1],
    		/*$$restProps*/ ctx[6]
    	];

    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    			add_location(a, file$9, 40, 0, 1249);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(a, "click", /*onClick*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32768)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[15], !current ? -1 : dirty, null, null);
    				}
    			}

    			set_attributes(a, a_data = get_spread_update(a_levels, [
    				(!current || dirty & /*href*/ 1) && { href: /*href*/ ctx[0] },
    				(!current || dirty & /*ariaCurrent*/ 4) && { "aria-current": /*ariaCurrent*/ ctx[2] },
    				dirty & /*props*/ 2 && /*props*/ ctx[1],
    				dirty & /*$$restProps*/ 64 && /*$$restProps*/ ctx[6]
    			]));
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let ariaCurrent;
    	const omit_props_names = ["to","replace","state","getProps"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let $base;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Link", slots, ['default']);
    	let { to = "#" } = $$props;
    	let { replace = false } = $$props;
    	let { state = {} } = $$props;
    	let { getProps = () => ({}) } = $$props;
    	const { base } = getContext(ROUTER);
    	validate_store(base, "base");
    	component_subscribe($$self, base, value => $$invalidate(13, $base = value));
    	const location = getContext(LOCATION);
    	validate_store(location, "location");
    	component_subscribe($$self, location, value => $$invalidate(14, $location = value));
    	const dispatch = createEventDispatcher();
    	let href, isPartiallyCurrent, isCurrent, props;

    	function onClick(event) {
    		dispatch("click", event);

    		if (shouldNavigate(event)) {
    			event.preventDefault();

    			// Don't push another entry to the history stack when the user
    			// clicks on a Link to the page they are currently on.
    			const shouldReplace = $location.pathname === href || replace;

    			navigate(href, { state, replace: shouldReplace });
    		}
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(6, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("to" in $$new_props) $$invalidate(7, to = $$new_props.to);
    		if ("replace" in $$new_props) $$invalidate(8, replace = $$new_props.replace);
    		if ("state" in $$new_props) $$invalidate(9, state = $$new_props.state);
    		if ("getProps" in $$new_props) $$invalidate(10, getProps = $$new_props.getProps);
    		if ("$$scope" in $$new_props) $$invalidate(15, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		createEventDispatcher,
    		ROUTER,
    		LOCATION,
    		navigate,
    		startsWith,
    		resolve,
    		shouldNavigate,
    		to,
    		replace,
    		state,
    		getProps,
    		base,
    		location,
    		dispatch,
    		href,
    		isPartiallyCurrent,
    		isCurrent,
    		props,
    		onClick,
    		$base,
    		$location,
    		ariaCurrent
    	});

    	$$self.$inject_state = $$new_props => {
    		if ("to" in $$props) $$invalidate(7, to = $$new_props.to);
    		if ("replace" in $$props) $$invalidate(8, replace = $$new_props.replace);
    		if ("state" in $$props) $$invalidate(9, state = $$new_props.state);
    		if ("getProps" in $$props) $$invalidate(10, getProps = $$new_props.getProps);
    		if ("href" in $$props) $$invalidate(0, href = $$new_props.href);
    		if ("isPartiallyCurrent" in $$props) $$invalidate(11, isPartiallyCurrent = $$new_props.isPartiallyCurrent);
    		if ("isCurrent" in $$props) $$invalidate(12, isCurrent = $$new_props.isCurrent);
    		if ("props" in $$props) $$invalidate(1, props = $$new_props.props);
    		if ("ariaCurrent" in $$props) $$invalidate(2, ariaCurrent = $$new_props.ariaCurrent);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*to, $base*/ 8320) {
    			$$invalidate(0, href = to === "/" ? $base.uri : resolve(to, $base.uri));
    		}

    		if ($$self.$$.dirty & /*$location, href*/ 16385) {
    			$$invalidate(11, isPartiallyCurrent = startsWith($location.pathname, href));
    		}

    		if ($$self.$$.dirty & /*href, $location*/ 16385) {
    			$$invalidate(12, isCurrent = href === $location.pathname);
    		}

    		if ($$self.$$.dirty & /*isCurrent*/ 4096) {
    			$$invalidate(2, ariaCurrent = isCurrent ? "page" : undefined);
    		}

    		if ($$self.$$.dirty & /*getProps, $location, href, isPartiallyCurrent, isCurrent*/ 23553) {
    			$$invalidate(1, props = getProps({
    				location: $location,
    				href,
    				isPartiallyCurrent,
    				isCurrent
    			}));
    		}
    	};

    	return [
    		href,
    		props,
    		ariaCurrent,
    		base,
    		location,
    		onClick,
    		$$restProps,
    		to,
    		replace,
    		state,
    		getProps,
    		isPartiallyCurrent,
    		isCurrent,
    		$base,
    		$location,
    		$$scope,
    		slots
    	];
    }

    class Link extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			to: 7,
    			replace: 8,
    			state: 9,
    			getProps: 10
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Link",
    			options,
    			id: create_fragment$a.name
    		});
    	}

    	get to() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set to(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get replace() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replace(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get state() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getProps() {
    		throw new Error("<Link>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getProps(value) {
    		throw new Error("<Link>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function circIn(t) {
        return 1.0 - Math.sqrt(1.0 - t * t);
    }
    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut } = {}) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => 'overflow: hidden;' +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* src/pages/about.svelte generated by Svelte v3.38.3 */
    const file$8 = "src/pages/about.svelte";

    function create_fragment$9(ctx) {
    	let t0;
    	let div;
    	let div_transition;
    	let current;

    	const block = {
    		c: function create() {
    			t0 = space();
    			div = element("div");
    			div.textContent = "about us";
    			document.title = "\n        درباره ما\n    ";
    			add_location(div, file$8, 13, 0, 336);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("About", slots, []);
    	var currentLocation = window.location.href;
    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<About> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		fade,
    		slide,
    		scale,
    		currentLocation,
    		splitUrl,
    		lastSugment
    	});

    	$$self.$inject_state = $$props => {
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) lastSugment = $$props.lastSugment;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [];
    }

    class About extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "About",
    			options,
    			id: create_fragment$9.name
    		});
    	}
    }

    /* src/pages/contact.svelte generated by Svelte v3.38.3 */

    function create_fragment$8(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("\ncontact us");
    			document.title = "\n        تماس باما\n    ";
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Contact", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Contact> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Contact extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Contact",
    			options,
    			id: create_fragment$8.name
    		});
    	}
    }

    // do not edit .js files directly - edit src/index.jst



    var fastDeepEqual = function equal(a, b) {
      if (a === b) return true;

      if (a && b && typeof a == 'object' && typeof b == 'object') {
        if (a.constructor !== b.constructor) return false;

        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0;)
            if (!equal(a[i], b[i])) return false;
          return true;
        }



        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;

        for (i = length; i-- !== 0;)
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;

        for (i = length; i-- !== 0;) {
          var key = keys[i];

          if (!equal(a[key], b[key])) return false;
        }

        return true;
      }

      // true if both NaN, false otherwise
      return a!==a && b!==b;
    };

    /**
     * Copyright 2019 Google LLC. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at.
     *
     *      Http://www.apache.org/licenses/LICENSE-2.0.
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    const DEFAULT_ID = "__googleMapsScriptId";
    /**
     * [[Loader]] makes it easier to add Google Maps JavaScript API to your application
     * dynamically using
     * [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
     * It works by dynamically creating and appending a script node to the the
     * document head and wrapping the callback function so as to return a promise.
     *
     * ```
     * const loader = new Loader({
     *   apiKey: "",
     *   version: "weekly",
     *   libraries: ["places"]
     * });
     *
     * loader.load().then((google) => {
     *   const map = new google.maps.Map(...)
     * })
     * ```
     */
    class Loader {
        /**
         * Creates an instance of Loader using [[LoaderOptions]]. No defaults are set
         * using this library, instead the defaults are set by the Google Maps
         * JavaScript API server.
         *
         * ```
         * const loader = Loader({apiKey, version: 'weekly', libraries: ['places']});
         * ```
         */
        constructor({ apiKey, channel, client, id = DEFAULT_ID, libraries = [], language, region, version, mapIds, nonce, retries = 3, url = "https://maps.googleapis.com/maps/api/js", }) {
            this.CALLBACK = "__googleMapsCallback";
            this.callbacks = [];
            this.done = false;
            this.loading = false;
            this.errors = [];
            this.version = version;
            this.apiKey = apiKey;
            this.channel = channel;
            this.client = client;
            this.id = id || DEFAULT_ID; // Do not allow empty string
            this.libraries = libraries;
            this.language = language;
            this.region = region;
            this.mapIds = mapIds;
            this.nonce = nonce;
            this.retries = retries;
            this.url = url;
            if (Loader.instance) {
                if (!fastDeepEqual(this.options, Loader.instance.options)) {
                    throw new Error(`Loader must not be called again with different options. ${JSON.stringify(this.options)} !== ${JSON.stringify(Loader.instance.options)}`);
                }
                return Loader.instance;
            }
            Loader.instance = this;
        }
        get options() {
            return {
                version: this.version,
                apiKey: this.apiKey,
                channel: this.channel,
                client: this.client,
                id: this.id,
                libraries: this.libraries,
                language: this.language,
                region: this.region,
                mapIds: this.mapIds,
                nonce: this.nonce,
                url: this.url,
            };
        }
        get failed() {
            return this.done && !this.loading && this.errors.length >= this.retries + 1;
        }
        /**
         * CreateUrl returns the Google Maps JavaScript API script url given the [[LoaderOptions]].
         *
         * @ignore
         */
        createUrl() {
            let url = this.url;
            url += `?callback=${this.CALLBACK}`;
            if (this.apiKey) {
                url += `&key=${this.apiKey}`;
            }
            if (this.channel) {
                url += `&channel=${this.channel}`;
            }
            if (this.client) {
                url += `&client=${this.client}`;
            }
            if (this.libraries.length > 0) {
                url += `&libraries=${this.libraries.join(",")}`;
            }
            if (this.language) {
                url += `&language=${this.language}`;
            }
            if (this.region) {
                url += `&region=${this.region}`;
            }
            if (this.version) {
                url += `&v=${this.version}`;
            }
            if (this.mapIds) {
                url += `&map_ids=${this.mapIds.join(",")}`;
            }
            return url;
        }
        /**
         * Load the Google Maps JavaScript API script and return a Promise.
         */
        load() {
            return this.loadPromise();
        }
        /**
         * Load the Google Maps JavaScript API script and return a Promise.
         *
         * @ignore
         */
        loadPromise() {
            return new Promise((resolve, reject) => {
                this.loadCallback((err) => {
                    if (!err) {
                        resolve(window.google);
                    }
                    else {
                        reject(err);
                    }
                });
            });
        }
        /**
         * Load the Google Maps JavaScript API script with a callback.
         */
        loadCallback(fn) {
            this.callbacks.push(fn);
            this.execute();
        }
        /**
         * Set the script on document.
         */
        setScript() {
            if (document.getElementById(this.id)) {
                // TODO wrap onerror callback for cases where the script was loaded elsewhere
                this.callback();
                return;
            }
            const url = this.createUrl();
            const script = document.createElement("script");
            script.id = this.id;
            script.type = "text/javascript";
            script.src = url;
            script.onerror = this.loadErrorCallback.bind(this);
            script.defer = true;
            script.async = true;
            if (this.nonce) {
                script.nonce = this.nonce;
            }
            document.head.appendChild(script);
        }
        deleteScript() {
            const script = document.getElementById(this.id);
            if (script) {
                script.remove();
            }
        }
        /**
         * Reset the loader state.
         */
        reset() {
            this.deleteScript();
            this.done = false;
            this.loading = false;
            this.errors = [];
            this.onerrorEvent = null;
        }
        resetIfRetryingFailed() {
            if (this.failed) {
                this.reset();
            }
        }
        loadErrorCallback(e) {
            this.errors.push(e);
            if (this.errors.length <= this.retries) {
                const delay = this.errors.length * Math.pow(2, this.errors.length);
                console.log(`Failed to load Google Maps script, retrying in ${delay} ms.`);
                setTimeout(() => {
                    this.deleteScript();
                    this.setScript();
                }, delay);
            }
            else {
                this.onerrorEvent = e;
                this.callback();
            }
        }
        setCallback() {
            window.__googleMapsCallback = this.callback.bind(this);
        }
        callback() {
            this.done = true;
            this.loading = false;
            this.callbacks.forEach((cb) => {
                cb(this.onerrorEvent);
            });
            this.callbacks = [];
        }
        execute() {
            this.resetIfRetryingFailed();
            if (this.done) {
                this.callback();
            }
            else {
                // short circuit and warn if google.maps is already loaded
                if (window.google && window.google.maps && window.google.maps.version) {
                    console.warn("Google Maps already loaded outside @googlemaps/js-api-loader." +
                        "This may result in undesirable behavior as options and script parameters may not match.");
                    this.callback();
                    return;
                }
                if (this.loading) ;
                else {
                    this.loading = true;
                    this.setCallback();
                    this.setScript();
                }
            }
        }
    }

    /* src/pages/show-detail.svelte generated by Svelte v3.38.3 */

    const { console: console_1$3, window: window_1$3 } = globals;
    const file$7 = "src/pages/show-detail.svelte";

    function create_fragment$7(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let t0;
    	let main;
    	let div50;
    	let aside0;
    	let div3;
    	let div2;
    	let div1;
    	let div0;
    	let a0;
    	let img0;
    	let img0_src_value;
    	let t1;
    	let aside5;
    	let div19;
    	let aside1;
    	let section0;
    	let div17;
    	let article0;
    	let div11;
    	let div10;
    	let div8;
    	let div7;
    	let div4;
    	let img1;
    	let img1_src_value;
    	let t2;
    	let div6;
    	let div5;
    	let h60;
    	let a1;
    	let t3;
    	let i0;
    	let t4;
    	let span0;
    	let i1;
    	let t5;
    	let t6;
    	let div9;
    	let i2;
    	let t7;
    	let ul0;
    	let li0;
    	let a2;
    	let i3;
    	let t8;
    	let t9;
    	let li1;
    	let a3;
    	let i4;
    	let t10;
    	let t11;
    	let li2;
    	let a4;
    	let i5;
    	let t12;
    	let t13;
    	let div12;
    	let h30;
    	let a5;
    	let t15;
    	let div13;
    	let img2;
    	let img2_src_value;
    	let t16;
    	let p0;
    	let t18;
    	let div14;
    	let a6;
    	let button0;
    	let t20;
    	let div16;
    	let a7;
    	let img3;
    	let img3_src_value;
    	let t21;
    	let span1;
    	let t23;
    	let t24;
    	let div15;
    	let i6;
    	let t25;
    	let t26;
    	let aside2;
    	let div18;
    	let t28;
    	let div34;
    	let aside3;
    	let section1;
    	let div33;
    	let article1;
    	let div27;
    	let div26;
    	let div24;
    	let div23;
    	let div20;
    	let img4;
    	let img4_src_value;
    	let t29;
    	let div22;
    	let div21;
    	let h61;
    	let a8;
    	let t30;
    	let i7;
    	let t31;
    	let span2;
    	let i8;
    	let t32;
    	let t33;
    	let div25;
    	let i9;
    	let t34;
    	let ul1;
    	let li3;
    	let a9;
    	let i10;
    	let t35;
    	let t36;
    	let li4;
    	let a10;
    	let i11;
    	let t37;
    	let t38;
    	let li5;
    	let a11;
    	let i12;
    	let t39;
    	let t40;
    	let div28;
    	let h31;
    	let a12;
    	let t42;
    	let div29;
    	let img5;
    	let img5_src_value;
    	let t43;
    	let p1;
    	let t45;
    	let div30;
    	let a13;
    	let button1;
    	let t47;
    	let div32;
    	let a14;
    	let img6;
    	let img6_src_value;
    	let t48;
    	let span3;
    	let t50;
    	let t51;
    	let div31;
    	let i13;
    	let t52;
    	let t53;
    	let div49;
    	let aside4;
    	let section2;
    	let div48;
    	let article2;
    	let div42;
    	let div41;
    	let div39;
    	let div38;
    	let div35;
    	let img7;
    	let img7_src_value;
    	let t54;
    	let div37;
    	let div36;
    	let h62;
    	let a15;
    	let t55;
    	let i14;
    	let t56;
    	let span4;
    	let i15;
    	let t57;
    	let t58;
    	let div40;
    	let i16;
    	let t59;
    	let ul2;
    	let li6;
    	let a16;
    	let i17;
    	let t60;
    	let t61;
    	let li7;
    	let a17;
    	let i18;
    	let t62;
    	let t63;
    	let li8;
    	let a18;
    	let i19;
    	let t64;
    	let t65;
    	let div43;
    	let h32;
    	let a19;
    	let t67;
    	let div44;
    	let img8;
    	let img8_src_value;
    	let t68;
    	let p2;
    	let t70;
    	let div45;
    	let a20;
    	let button2;
    	let t72;
    	let div47;
    	let a21;
    	let img9;
    	let img9_src_value;
    	let t73;
    	let span5;
    	let t75;
    	let t76;
    	let div46;
    	let i20;
    	let t77;
    	let main_transition;
    	let t78;
    	let br0;
    	let br1;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[2]);

    	const block = {
    		c: function create() {
    			t0 = space();
    			main = element("main");
    			div50 = element("div");
    			aside0 = element("aside");
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			a0 = element("a");
    			img0 = element("img");
    			t1 = space();
    			aside5 = element("aside");
    			div19 = element("div");
    			aside1 = element("aside");
    			section0 = element("section");
    			div17 = element("div");
    			article0 = element("article");
    			div11 = element("div");
    			div10 = element("div");
    			div8 = element("div");
    			div7 = element("div");
    			div4 = element("div");
    			img1 = element("img");
    			t2 = space();
    			div6 = element("div");
    			div5 = element("div");
    			h60 = element("h6");
    			a1 = element("a");
    			t3 = text("مرکز رشد و نواوری آفرینه ");
    			i0 = element("i");
    			t4 = space();
    			span0 = element("span");
    			i1 = element("i");
    			t5 = text(" ۳ دقیقه قبل");
    			t6 = space();
    			div9 = element("div");
    			i2 = element("i");
    			t7 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a2 = element("a");
    			i3 = element("i");
    			t8 = text(" ذخیره کردن پست");
    			t9 = space();
    			li1 = element("li");
    			a3 = element("a");
    			i4 = element("i");
    			t10 = text(" کپی کردن لینک");
    			t11 = space();
    			li2 = element("li");
    			a4 = element("a");
    			i5 = element("i");
    			t12 = text(" گزارش دادن");
    			t13 = space();
    			div12 = element("div");
    			h30 = element("h3");
    			a5 = element("a");
    			a5.textContent = "به اینولینکس خوش آمدید";
    			t15 = space();
    			div13 = element("div");
    			img2 = element("img");
    			t16 = space();
    			p0 = element("p");
    			p0.textContent = "طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t18 = space();
    			div14 = element("div");
    			a6 = element("a");
    			button0 = element("button");
    			button0.textContent = "ادامه مطلب";
    			t20 = space();
    			div16 = element("div");
    			a7 = element("a");
    			img3 = element("img");
    			t21 = space();
    			span1 = element("span");
    			span1.textContent = "مسعودآقایی ساداتی";
    			t23 = text("  ");
    			t24 = space();
    			div15 = element("div");
    			i6 = element("i");
    			t25 = text(" ۵۶");
    			t26 = space();
    			aside2 = element("aside");
    			div18 = element("div");
    			div18.textContent = "hello";
    			t28 = space();
    			div34 = element("div");
    			aside3 = element("aside");
    			section1 = element("section");
    			div33 = element("div");
    			article1 = element("article");
    			div27 = element("div");
    			div26 = element("div");
    			div24 = element("div");
    			div23 = element("div");
    			div20 = element("div");
    			img4 = element("img");
    			t29 = space();
    			div22 = element("div");
    			div21 = element("div");
    			h61 = element("h6");
    			a8 = element("a");
    			t30 = text("مرکز رشد و نواوری آفرینه ");
    			i7 = element("i");
    			t31 = space();
    			span2 = element("span");
    			i8 = element("i");
    			t32 = text(" ۳ دقیقه قبل");
    			t33 = space();
    			div25 = element("div");
    			i9 = element("i");
    			t34 = space();
    			ul1 = element("ul");
    			li3 = element("li");
    			a9 = element("a");
    			i10 = element("i");
    			t35 = text(" ذخیره کردن پست");
    			t36 = space();
    			li4 = element("li");
    			a10 = element("a");
    			i11 = element("i");
    			t37 = text(" کپی کردن لینک");
    			t38 = space();
    			li5 = element("li");
    			a11 = element("a");
    			i12 = element("i");
    			t39 = text(" گزارش دادن");
    			t40 = space();
    			div28 = element("div");
    			h31 = element("h3");
    			a12 = element("a");
    			a12.textContent = "به اینولینکس خوش آمدید";
    			t42 = space();
    			div29 = element("div");
    			img5 = element("img");
    			t43 = space();
    			p1 = element("p");
    			p1.textContent = "طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t45 = space();
    			div30 = element("div");
    			a13 = element("a");
    			button1 = element("button");
    			button1.textContent = "ادامه مطلب";
    			t47 = space();
    			div32 = element("div");
    			a14 = element("a");
    			img6 = element("img");
    			t48 = space();
    			span3 = element("span");
    			span3.textContent = "مسعودآقایی ساداتی";
    			t50 = text("  ");
    			t51 = space();
    			div31 = element("div");
    			i13 = element("i");
    			t52 = text(" ۵۶");
    			t53 = space();
    			div49 = element("div");
    			aside4 = element("aside");
    			section2 = element("section");
    			div48 = element("div");
    			article2 = element("article");
    			div42 = element("div");
    			div41 = element("div");
    			div39 = element("div");
    			div38 = element("div");
    			div35 = element("div");
    			img7 = element("img");
    			t54 = space();
    			div37 = element("div");
    			div36 = element("div");
    			h62 = element("h6");
    			a15 = element("a");
    			t55 = text("مرکز رشد و نواوری آفرینه ");
    			i14 = element("i");
    			t56 = space();
    			span4 = element("span");
    			i15 = element("i");
    			t57 = text(" ۳ دقیقه قبل");
    			t58 = space();
    			div40 = element("div");
    			i16 = element("i");
    			t59 = space();
    			ul2 = element("ul");
    			li6 = element("li");
    			a16 = element("a");
    			i17 = element("i");
    			t60 = text(" ذخیره کردن پست");
    			t61 = space();
    			li7 = element("li");
    			a17 = element("a");
    			i18 = element("i");
    			t62 = text(" کپی کردن لینک");
    			t63 = space();
    			li8 = element("li");
    			a18 = element("a");
    			i19 = element("i");
    			t64 = text(" گزارش دادن");
    			t65 = space();
    			div43 = element("div");
    			h32 = element("h3");
    			a19 = element("a");
    			a19.textContent = "به اینولینکس خوش آمدید";
    			t67 = space();
    			div44 = element("div");
    			img8 = element("img");
    			t68 = space();
    			p2 = element("p");
    			p2.textContent = "طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.\n                                   \n                                    طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                     صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                     برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید  طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                    برای پر کردن صفحه و ارایه اولیه شکل \n                                    ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                    صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                    تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t70 = space();
    			div45 = element("div");
    			a20 = element("a");
    			button2 = element("button");
    			button2.textContent = "ادامه مطلب";
    			t72 = space();
    			div47 = element("div");
    			a21 = element("a");
    			img9 = element("img");
    			t73 = space();
    			span5 = element("span");
    			span5.textContent = "مسعودآقایی ساداتی";
    			t75 = text("  ");
    			t76 = space();
    			div46 = element("div");
    			i20 = element("i");
    			t77 = text(" ۵۶");
    			t78 = space();
    			br0 = element("br");
    			br1 = element("br");
    			document.title = "\n       جزییات مقاله\n    ";
    			attr_dev(img0, "class", "w-100 dream-job-image");
    			if (img0.src !== (img0_src_value = "../image/job.jpg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$7, 42, 32, 1353);
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$7, 41, 28, 1308);
    			attr_dev(div0, "class", "col-12 my-1");
    			add_location(div0, file$7, 40, 24, 1254);
    			attr_dev(div1, "class", "row ");
    			add_location(div1, file$7, 39, 20, 1211);
    			attr_dev(div2, "class", "col-12 shadow-radius-section bg-light");
    			add_location(div2, file$7, 38, 16, 1139);
    			attr_dev(div3, "class", "row");
    			add_location(div3, file$7, 37, 12, 1105);
    			attr_dev(aside0, "class", "col-12 col-md-3 mr-2 d-none d-md-inline");
    			add_location(aside0, file$7, 36, 8, 1036);
    			attr_dev(img1, "class", "cu-image-com mr-1 ");
    			if (img1.src !== (img1_src_value = "../image/afarine.jpg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$7, 62, 52, 2452);
    			attr_dev(div4, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div4, file$7, 61, 48, 2343);
    			set_style(i0, "color", "#048af7");
    			attr_dev(i0, "class", "fas fa-check-circle");
    			add_location(i0, file$7, 66, 126, 2906);
    			attr_dev(a1, "href", "#");
    			attr_dev(a1, "class", "title-post-link");
    			add_location(a1, file$7, 66, 60, 2840);
    			add_location(h60, file$7, 66, 56, 2836);
    			attr_dev(i1, "class", "fas fa-clock");
    			add_location(i1, file$7, 67, 88, 3062);
    			attr_dev(span0, "class", "show-time-custome");
    			add_location(span0, file$7, 67, 56, 3030);
    			attr_dev(div5, "class", "cu-intro mt-2");
    			add_location(div5, file$7, 65, 52, 2752);
    			attr_dev(div6, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center ");
    			add_location(div6, file$7, 64, 48, 2622);
    			attr_dev(div7, "class", "row ");
    			add_location(div7, file$7, 60, 44, 2276);
    			attr_dev(div8, "class", "col-11 col-md-11");
    			add_location(div8, file$7, 59, 40, 2200);
    			attr_dev(i2, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i2, "type", "button");
    			attr_dev(i2, "data-toggle", "dropdown");
    			add_location(i2, file$7, 73, 44, 3450);
    			attr_dev(i3, "class", "far fa-bookmark");
    			add_location(i3, file$7, 75, 128, 3738);
    			attr_dev(a2, "class", "dropdown-item");
    			attr_dev(a2, "href", "#");
    			add_location(a2, file$7, 75, 93, 3703);
    			add_location(li0, file$7, 75, 48, 3658);
    			attr_dev(i4, "class", "fas fa-share-alt");
    			add_location(i4, file$7, 76, 86, 3881);
    			attr_dev(a3, "class", "dropdown-item");
    			attr_dev(a3, "href", "#");
    			add_location(a3, file$7, 76, 52, 3847);
    			add_location(li1, file$7, 76, 48, 3843);
    			attr_dev(i5, "class", "fas fa-flag");
    			add_location(i5, file$7, 77, 86, 4024);
    			attr_dev(a4, "class", "dropdown-item");
    			attr_dev(a4, "href", "#");
    			add_location(a4, file$7, 77, 52, 3990);
    			add_location(li2, file$7, 77, 48, 3986);
    			attr_dev(ul0, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul0, file$7, 74, 44, 3569);
    			attr_dev(div9, "class", "col-1 ml-0 pl-0 pr-4 dropdown");
    			add_location(div9, file$7, 72, 40, 3362);
    			attr_dev(div10, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div10, file$7, 58, 36, 2101);
    			attr_dev(div11, "class", "col-12");
    			add_location(div11, file$7, 57, 32, 2044);
    			attr_dev(a5, "class", "title-post-link");
    			attr_dev(a5, "href", "#");
    			add_location(a5, file$7, 84, 80, 4421);
    			attr_dev(h30, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h30, file$7, 84, 36, 4377);
    			attr_dev(div12, "class", "col-12 p-0");
    			add_location(div12, file$7, 83, 32, 4316);
    			if (img2.src !== (img2_src_value = "../image/30.jpg")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img2, "alt", "");
    			add_location(img2, file$7, 87, 36, 4654);
    			attr_dev(div13, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div13, file$7, 86, 32, 4560);
    			attr_dev(p0, "class", "col-12 mt-3 post-text");
    			add_location(p0, file$7, 90, 32, 4844);
    			attr_dev(button0, "id", "read-more");
    			attr_dev(button0, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button0, file$7, 184, 40, 14968);
    			attr_dev(a6, "href", "#");
    			add_location(a6, file$7, 183, 36, 14915);
    			attr_dev(div14, "class", "col-12 ");
    			add_location(div14, file$7, 182, 32, 14857);
    			attr_dev(img3, "class", "personal-img");
    			if (img3.src !== (img3_src_value = "../image/1.jpeg")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "alt", "");
    			add_location(img3, file$7, 190, 40, 15387);
    			attr_dev(span1, "class", "personal-name");
    			add_location(span1, file$7, 191, 40, 15483);
    			attr_dev(a7, "class", "a-clicked");
    			attr_dev(a7, "href", "#");
    			add_location(a7, file$7, 189, 36, 15316);
    			attr_dev(i6, "class", "fas fa-eye");
    			add_location(i6, file$7, 193, 60, 15650);
    			attr_dev(div15, "class", "view-count");
    			add_location(div15, file$7, 193, 36, 15626);
    			attr_dev(div16, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div16, file$7, 188, 32, 15233);
    			attr_dev(article0, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article0, file$7, 56, 28, 1938);
    			attr_dev(div17, "class", "col-12 p-0 main-article ");
    			add_location(div17, file$7, 55, 24, 1871);
    			attr_dev(section0, "class", "row mx-0 mt-3 mr-0 pt-0  ");
    			add_location(section0, file$7, 54, 20, 1803);
    			attr_dev(aside1, "class", "col-12 col-md-9 order-first justify-content-between order-md-0 mx-0 ");
    			add_location(aside1, file$7, 53, 16, 1698);
    			attr_dev(div18, "class", "row px-0 text-center shadow-radius-section bg-light ");
    			add_location(div18, file$7, 200, 20, 15945);
    			attr_dev(aside2, "class", " col-12 col-md-3 mt-3 d-none d-md-inline");
    			add_location(aside2, file$7, 199, 16, 15867);
    			attr_dev(div19, "class", "row px-0 mx-0");
    			add_location(div19, file$7, 52, 12, 1653);
    			attr_dev(img4, "class", "cu-image-com mr-1 ");
    			if (img4.src !== (img4_src_value = "../image/afarine.jpg")) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "alt", "");
    			add_location(img4, file$7, 215, 52, 16915);
    			attr_dev(div20, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div20, file$7, 214, 48, 16806);
    			set_style(i7, "color", "#048af7");
    			attr_dev(i7, "class", "fas fa-check-circle");
    			add_location(i7, file$7, 219, 126, 17369);
    			attr_dev(a8, "href", "#");
    			attr_dev(a8, "class", "title-post-link");
    			add_location(a8, file$7, 219, 60, 17303);
    			add_location(h61, file$7, 219, 56, 17299);
    			attr_dev(i8, "class", "fas fa-clock");
    			add_location(i8, file$7, 220, 88, 17525);
    			attr_dev(span2, "class", "show-time-custome");
    			add_location(span2, file$7, 220, 56, 17493);
    			attr_dev(div21, "class", "cu-intro mt-2");
    			add_location(div21, file$7, 218, 52, 17215);
    			attr_dev(div22, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center ");
    			add_location(div22, file$7, 217, 48, 17085);
    			attr_dev(div23, "class", "row ");
    			add_location(div23, file$7, 213, 44, 16739);
    			attr_dev(div24, "class", "col-11 col-md-11");
    			add_location(div24, file$7, 212, 40, 16663);
    			attr_dev(i9, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i9, "type", "button");
    			attr_dev(i9, "data-toggle", "dropdown");
    			add_location(i9, file$7, 226, 44, 17913);
    			attr_dev(i10, "class", "far fa-bookmark");
    			add_location(i10, file$7, 228, 128, 18201);
    			attr_dev(a9, "class", "dropdown-item");
    			attr_dev(a9, "href", "#");
    			add_location(a9, file$7, 228, 93, 18166);
    			add_location(li3, file$7, 228, 48, 18121);
    			attr_dev(i11, "class", "fas fa-share-alt");
    			add_location(i11, file$7, 229, 86, 18344);
    			attr_dev(a10, "class", "dropdown-item");
    			attr_dev(a10, "href", "#");
    			add_location(a10, file$7, 229, 52, 18310);
    			add_location(li4, file$7, 229, 48, 18306);
    			attr_dev(i12, "class", "fas fa-flag");
    			add_location(i12, file$7, 230, 86, 18487);
    			attr_dev(a11, "class", "dropdown-item");
    			attr_dev(a11, "href", "#");
    			add_location(a11, file$7, 230, 52, 18453);
    			add_location(li5, file$7, 230, 48, 18449);
    			attr_dev(ul1, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul1, file$7, 227, 44, 18032);
    			attr_dev(div25, "class", "col-1 ml-0 pl-0 pr-4 dropdown");
    			add_location(div25, file$7, 225, 40, 17825);
    			attr_dev(div26, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div26, file$7, 211, 36, 16564);
    			attr_dev(div27, "class", "col-12");
    			add_location(div27, file$7, 210, 32, 16507);
    			attr_dev(a12, "class", "title-post-link");
    			attr_dev(a12, "href", "#");
    			add_location(a12, file$7, 237, 80, 18884);
    			attr_dev(h31, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h31, file$7, 237, 36, 18840);
    			attr_dev(div28, "class", "col-12 p-0");
    			add_location(div28, file$7, 236, 32, 18779);
    			if (img5.src !== (img5_src_value = "../image/30.jpg")) attr_dev(img5, "src", img5_src_value);
    			attr_dev(img5, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img5, "alt", "");
    			add_location(img5, file$7, 240, 36, 19117);
    			attr_dev(div29, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div29, file$7, 239, 32, 19023);
    			attr_dev(p1, "class", "col-12 mt-3 post-text");
    			add_location(p1, file$7, 243, 32, 19307);
    			attr_dev(button1, "id", "read-more");
    			attr_dev(button1, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button1, file$7, 337, 40, 29431);
    			attr_dev(a13, "href", "#");
    			add_location(a13, file$7, 336, 36, 29378);
    			attr_dev(div30, "class", "col-12 ");
    			add_location(div30, file$7, 335, 32, 29320);
    			attr_dev(img6, "class", "personal-img");
    			if (img6.src !== (img6_src_value = "../image/1.jpeg")) attr_dev(img6, "src", img6_src_value);
    			attr_dev(img6, "alt", "");
    			add_location(img6, file$7, 343, 40, 29850);
    			attr_dev(span3, "class", "personal-name");
    			add_location(span3, file$7, 344, 40, 29946);
    			attr_dev(a14, "class", "a-clicked");
    			attr_dev(a14, "href", "#");
    			add_location(a14, file$7, 342, 36, 29779);
    			attr_dev(i13, "class", "fas fa-eye");
    			add_location(i13, file$7, 346, 60, 30113);
    			attr_dev(div31, "class", "view-count");
    			add_location(div31, file$7, 346, 36, 30089);
    			attr_dev(div32, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div32, file$7, 341, 32, 29696);
    			attr_dev(article1, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article1, file$7, 209, 28, 16401);
    			attr_dev(div33, "class", "col-12 p-0 main-article ");
    			add_location(div33, file$7, 208, 24, 16334);
    			attr_dev(section1, "class", "row mx-0 mt-3 mr-0 pt-0  ");
    			add_location(section1, file$7, 207, 20, 16266);
    			attr_dev(aside3, "class", "col-12 order-first justify-content-between order-md-0 mx-0 ");
    			add_location(aside3, file$7, 206, 16, 16170);
    			attr_dev(div34, "class", "row px-0 mx-0");
    			add_location(div34, file$7, 205, 12, 16125);
    			attr_dev(img7, "class", "cu-image-com mr-1 ");
    			if (img7.src !== (img7_src_value = "../image/afarine.jpg")) attr_dev(img7, "src", img7_src_value);
    			attr_dev(img7, "alt", "");
    			add_location(img7, file$7, 363, 52, 31135);
    			attr_dev(div35, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div35, file$7, 362, 48, 31026);
    			set_style(i14, "color", "#048af7");
    			attr_dev(i14, "class", "fas fa-check-circle");
    			add_location(i14, file$7, 367, 126, 31589);
    			attr_dev(a15, "href", "#");
    			attr_dev(a15, "class", "title-post-link");
    			add_location(a15, file$7, 367, 60, 31523);
    			add_location(h62, file$7, 367, 56, 31519);
    			attr_dev(i15, "class", "fas fa-clock");
    			add_location(i15, file$7, 368, 88, 31745);
    			attr_dev(span4, "class", "show-time-custome");
    			add_location(span4, file$7, 368, 56, 31713);
    			attr_dev(div36, "class", "cu-intro mt-2");
    			add_location(div36, file$7, 366, 52, 31435);
    			attr_dev(div37, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center ");
    			add_location(div37, file$7, 365, 48, 31305);
    			attr_dev(div38, "class", "row ");
    			add_location(div38, file$7, 361, 44, 30959);
    			attr_dev(div39, "class", "col-11 col-md-11");
    			add_location(div39, file$7, 360, 40, 30883);
    			attr_dev(i16, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i16, "type", "button");
    			attr_dev(i16, "data-toggle", "dropdown");
    			add_location(i16, file$7, 374, 44, 32133);
    			attr_dev(i17, "class", "far fa-bookmark");
    			add_location(i17, file$7, 376, 128, 32421);
    			attr_dev(a16, "class", "dropdown-item");
    			attr_dev(a16, "href", "#");
    			add_location(a16, file$7, 376, 93, 32386);
    			add_location(li6, file$7, 376, 48, 32341);
    			attr_dev(i18, "class", "fas fa-share-alt");
    			add_location(i18, file$7, 377, 86, 32564);
    			attr_dev(a17, "class", "dropdown-item");
    			attr_dev(a17, "href", "#");
    			add_location(a17, file$7, 377, 52, 32530);
    			add_location(li7, file$7, 377, 48, 32526);
    			attr_dev(i19, "class", "fas fa-flag");
    			add_location(i19, file$7, 378, 86, 32707);
    			attr_dev(a18, "class", "dropdown-item");
    			attr_dev(a18, "href", "#");
    			add_location(a18, file$7, 378, 52, 32673);
    			add_location(li8, file$7, 378, 48, 32669);
    			attr_dev(ul2, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul2, file$7, 375, 44, 32252);
    			attr_dev(div40, "class", "col-1 ml-0 pl-0 pr-4 dropdown");
    			add_location(div40, file$7, 373, 40, 32045);
    			attr_dev(div41, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div41, file$7, 359, 36, 30784);
    			attr_dev(div42, "class", "col-12");
    			add_location(div42, file$7, 358, 32, 30727);
    			attr_dev(a19, "class", "title-post-link");
    			attr_dev(a19, "href", "#");
    			add_location(a19, file$7, 385, 80, 33104);
    			attr_dev(h32, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h32, file$7, 385, 36, 33060);
    			attr_dev(div43, "class", "col-12 p-0");
    			add_location(div43, file$7, 384, 32, 32999);
    			if (img8.src !== (img8_src_value = "../image/30.jpg")) attr_dev(img8, "src", img8_src_value);
    			attr_dev(img8, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img8, "alt", "");
    			add_location(img8, file$7, 388, 36, 33337);
    			attr_dev(div44, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div44, file$7, 387, 32, 33243);
    			attr_dev(p2, "class", "col-12 mt-3 post-text");
    			add_location(p2, file$7, 391, 32, 33527);
    			attr_dev(button2, "id", "read-more");
    			attr_dev(button2, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button2, file$7, 485, 40, 43651);
    			attr_dev(a20, "href", "#");
    			add_location(a20, file$7, 484, 36, 43598);
    			attr_dev(div45, "class", "col-12 ");
    			add_location(div45, file$7, 483, 32, 43540);
    			attr_dev(img9, "class", "personal-img");
    			if (img9.src !== (img9_src_value = "../image/1.jpeg")) attr_dev(img9, "src", img9_src_value);
    			attr_dev(img9, "alt", "");
    			add_location(img9, file$7, 491, 40, 44070);
    			attr_dev(span5, "class", "personal-name");
    			add_location(span5, file$7, 492, 40, 44166);
    			attr_dev(a21, "class", "a-clicked");
    			attr_dev(a21, "href", "#");
    			add_location(a21, file$7, 490, 36, 43999);
    			attr_dev(i20, "class", "fas fa-eye");
    			add_location(i20, file$7, 494, 60, 44333);
    			attr_dev(div46, "class", "view-count");
    			add_location(div46, file$7, 494, 36, 44309);
    			attr_dev(div47, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div47, file$7, 489, 32, 43916);
    			attr_dev(article2, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article2, file$7, 357, 28, 30621);
    			attr_dev(div48, "class", "col-12 p-0 main-article ");
    			add_location(div48, file$7, 356, 24, 30554);
    			attr_dev(section2, "class", "row mx-0 mt-3 mr-0 pt-0  ");
    			add_location(section2, file$7, 355, 20, 30486);
    			attr_dev(aside4, "class", "col-12 order-first justify-content-between order-md-0 mx-0 ");
    			add_location(aside4, file$7, 354, 16, 30390);
    			attr_dev(div49, "class", "row px-0 mx-0");
    			add_location(div49, file$7, 353, 12, 30345);
    			attr_dev(aside5, "class", "col-12 col-md-8  ");
    			add_location(aside5, file$7, 49, 8, 1577);
    			attr_dev(div50, "class", "row justify-content-center mx-0");
    			add_location(div50, file$7, 34, 4, 973);
    			attr_dev(main, "class", "container-fluid pin-parent ");
    			add_location(main, file$7, 33, 0, 909);
    			add_location(br0, file$7, 506, 0, 44611);
    			add_location(br1, file$7, 506, 4, 44615);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, div50);
    			append_dev(div50, aside0);
    			append_dev(aside0, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, a0);
    			append_dev(a0, img0);
    			append_dev(div50, t1);
    			append_dev(div50, aside5);
    			append_dev(aside5, div19);
    			append_dev(div19, aside1);
    			append_dev(aside1, section0);
    			append_dev(section0, div17);
    			append_dev(div17, article0);
    			append_dev(article0, div11);
    			append_dev(div11, div10);
    			append_dev(div10, div8);
    			append_dev(div8, div7);
    			append_dev(div7, div4);
    			append_dev(div4, img1);
    			append_dev(div7, t2);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, h60);
    			append_dev(h60, a1);
    			append_dev(a1, t3);
    			append_dev(a1, i0);
    			append_dev(div5, t4);
    			append_dev(div5, span0);
    			append_dev(span0, i1);
    			append_dev(span0, t5);
    			append_dev(div10, t6);
    			append_dev(div10, div9);
    			append_dev(div9, i2);
    			append_dev(div9, t7);
    			append_dev(div9, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a2);
    			append_dev(a2, i3);
    			append_dev(a2, t8);
    			append_dev(ul0, t9);
    			append_dev(ul0, li1);
    			append_dev(li1, a3);
    			append_dev(a3, i4);
    			append_dev(a3, t10);
    			append_dev(ul0, t11);
    			append_dev(ul0, li2);
    			append_dev(li2, a4);
    			append_dev(a4, i5);
    			append_dev(a4, t12);
    			append_dev(article0, t13);
    			append_dev(article0, div12);
    			append_dev(div12, h30);
    			append_dev(h30, a5);
    			append_dev(article0, t15);
    			append_dev(article0, div13);
    			append_dev(div13, img2);
    			append_dev(article0, t16);
    			append_dev(article0, p0);
    			append_dev(article0, t18);
    			append_dev(article0, div14);
    			append_dev(div14, a6);
    			append_dev(a6, button0);
    			append_dev(article0, t20);
    			append_dev(article0, div16);
    			append_dev(div16, a7);
    			append_dev(a7, img3);
    			append_dev(a7, t21);
    			append_dev(a7, span1);
    			append_dev(a7, t23);
    			append_dev(div16, t24);
    			append_dev(div16, div15);
    			append_dev(div15, i6);
    			append_dev(div15, t25);
    			append_dev(div19, t26);
    			append_dev(div19, aside2);
    			append_dev(aside2, div18);
    			append_dev(aside5, t28);
    			append_dev(aside5, div34);
    			append_dev(div34, aside3);
    			append_dev(aside3, section1);
    			append_dev(section1, div33);
    			append_dev(div33, article1);
    			append_dev(article1, div27);
    			append_dev(div27, div26);
    			append_dev(div26, div24);
    			append_dev(div24, div23);
    			append_dev(div23, div20);
    			append_dev(div20, img4);
    			append_dev(div23, t29);
    			append_dev(div23, div22);
    			append_dev(div22, div21);
    			append_dev(div21, h61);
    			append_dev(h61, a8);
    			append_dev(a8, t30);
    			append_dev(a8, i7);
    			append_dev(div21, t31);
    			append_dev(div21, span2);
    			append_dev(span2, i8);
    			append_dev(span2, t32);
    			append_dev(div26, t33);
    			append_dev(div26, div25);
    			append_dev(div25, i9);
    			append_dev(div25, t34);
    			append_dev(div25, ul1);
    			append_dev(ul1, li3);
    			append_dev(li3, a9);
    			append_dev(a9, i10);
    			append_dev(a9, t35);
    			append_dev(ul1, t36);
    			append_dev(ul1, li4);
    			append_dev(li4, a10);
    			append_dev(a10, i11);
    			append_dev(a10, t37);
    			append_dev(ul1, t38);
    			append_dev(ul1, li5);
    			append_dev(li5, a11);
    			append_dev(a11, i12);
    			append_dev(a11, t39);
    			append_dev(article1, t40);
    			append_dev(article1, div28);
    			append_dev(div28, h31);
    			append_dev(h31, a12);
    			append_dev(article1, t42);
    			append_dev(article1, div29);
    			append_dev(div29, img5);
    			append_dev(article1, t43);
    			append_dev(article1, p1);
    			append_dev(article1, t45);
    			append_dev(article1, div30);
    			append_dev(div30, a13);
    			append_dev(a13, button1);
    			append_dev(article1, t47);
    			append_dev(article1, div32);
    			append_dev(div32, a14);
    			append_dev(a14, img6);
    			append_dev(a14, t48);
    			append_dev(a14, span3);
    			append_dev(a14, t50);
    			append_dev(div32, t51);
    			append_dev(div32, div31);
    			append_dev(div31, i13);
    			append_dev(div31, t52);
    			append_dev(aside5, t53);
    			append_dev(aside5, div49);
    			append_dev(div49, aside4);
    			append_dev(aside4, section2);
    			append_dev(section2, div48);
    			append_dev(div48, article2);
    			append_dev(article2, div42);
    			append_dev(div42, div41);
    			append_dev(div41, div39);
    			append_dev(div39, div38);
    			append_dev(div38, div35);
    			append_dev(div35, img7);
    			append_dev(div38, t54);
    			append_dev(div38, div37);
    			append_dev(div37, div36);
    			append_dev(div36, h62);
    			append_dev(h62, a15);
    			append_dev(a15, t55);
    			append_dev(a15, i14);
    			append_dev(div36, t56);
    			append_dev(div36, span4);
    			append_dev(span4, i15);
    			append_dev(span4, t57);
    			append_dev(div41, t58);
    			append_dev(div41, div40);
    			append_dev(div40, i16);
    			append_dev(div40, t59);
    			append_dev(div40, ul2);
    			append_dev(ul2, li6);
    			append_dev(li6, a16);
    			append_dev(a16, i17);
    			append_dev(a16, t60);
    			append_dev(ul2, t61);
    			append_dev(ul2, li7);
    			append_dev(li7, a17);
    			append_dev(a17, i18);
    			append_dev(a17, t62);
    			append_dev(ul2, t63);
    			append_dev(ul2, li8);
    			append_dev(li8, a18);
    			append_dev(a18, i19);
    			append_dev(a18, t64);
    			append_dev(article2, t65);
    			append_dev(article2, div43);
    			append_dev(div43, h32);
    			append_dev(h32, a19);
    			append_dev(article2, t67);
    			append_dev(article2, div44);
    			append_dev(div44, img8);
    			append_dev(article2, t68);
    			append_dev(article2, p2);
    			append_dev(article2, t70);
    			append_dev(article2, div45);
    			append_dev(div45, a20);
    			append_dev(a20, button2);
    			append_dev(article2, t72);
    			append_dev(article2, div47);
    			append_dev(div47, a21);
    			append_dev(a21, img9);
    			append_dev(a21, t73);
    			append_dev(a21, span5);
    			append_dev(a21, t75);
    			append_dev(div47, t76);
    			append_dev(div47, div46);
    			append_dev(div46, i20);
    			append_dev(div46, t77);
    			insert_dev(target, t78, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, br1, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(window_1$3, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[2]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 1 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$3.pageXOffset, /*y*/ ctx[0]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, true);
    				main_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, false);
    			main_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (detaching && main_transition) main_transition.end();
    			if (detaching) detach_dev(t78);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(br1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Show_detail", slots, []);
    	let { url = "" } = $$props;
    	let { y } = $$props;
    	const urlParams = new URLSearchParams(window.location.search);
    	const id = urlParams.has("id");
    	console.log(id);
    	let isOpen = false;

    	function toggleNav() {
    		isOpen = !isOpen;
    	}

    	//let y=0;
    	var currentLocation = window.location.href;

    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];

    	// $ : console.log(lastSugment);
    	let map;

    	const writable_props = ["url", "y"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$3.warn(`<Show_detail> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(0, y = window_1$3.pageYOffset);
    	}

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(1, url = $$props.url);
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		fade,
    		slide,
    		scale,
    		fly,
    		Loader,
    		Router,
    		Link,
    		Route,
    		circIn,
    		url,
    		y,
    		urlParams,
    		id,
    		isOpen,
    		toggleNav,
    		currentLocation,
    		splitUrl,
    		lastSugment,
    		map
    	});

    	$$self.$inject_state = $$props => {
    		if ("url" in $$props) $$invalidate(1, url = $$props.url);
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    		if ("isOpen" in $$props) isOpen = $$props.isOpen;
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) lastSugment = $$props.lastSugment;
    		if ("map" in $$props) map = $$props.map;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [y, url, onwindowscroll];
    }

    class Show_detail extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { url: 1, y: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Show_detail",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[0] === undefined && !("y" in props)) {
    			console_1$3.warn("<Show_detail> was created without expected prop 'y'");
    		}
    	}

    	get url() {
    		throw new Error("<Show_detail>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Show_detail>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Show_detail>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Show_detail>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/pages/profile.svelte generated by Svelte v3.38.3 */

    const { console: console_1$2, window: window_1$2 } = globals;
    const file$6 = "src/pages/profile.svelte";

    // (39:0) {#if y>600}
    function create_if_block_1$2(ctx) {
    	let section;
    	let div10;
    	let div7;
    	let div2;
    	let div1;
    	let button0;
    	let i0;
    	let t0;
    	let t1;
    	let div0;
    	let button1;
    	let t3;
    	let ul0;
    	let li0;
    	let a0;
    	let i1;
    	let t4;
    	let t5;
    	let li1;
    	let a1;
    	let i2;
    	let t6;
    	let t7;
    	let div6;
    	let div5;
    	let div3;
    	let img;
    	let img_src_value;
    	let t8;
    	let div4;
    	let h5;
    	let t9;
    	let i3;
    	let t10;
    	let div9;
    	let div8;
    	let ul1;
    	let li2;
    	let a2;
    	let t12;
    	let li3;
    	let a3;
    	let div10_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div10 = element("div");
    			div7 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			button0 = element("button");
    			i0 = element("i");
    			t0 = text("بازدید سایت");
    			t1 = space();
    			div0 = element("div");
    			button1 = element("button");
    			button1.textContent = "بیشتر";
    			t3 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			i1 = element("i");
    			t4 = text(" اشتراک صفحه");
    			t5 = space();
    			li1 = element("li");
    			a1 = element("a");
    			i2 = element("i");
    			t6 = text(" گزارش دادن");
    			t7 = space();
    			div6 = element("div");
    			div5 = element("div");
    			div3 = element("div");
    			img = element("img");
    			t8 = space();
    			div4 = element("div");
    			h5 = element("h5");
    			t9 = text("آفرینه ");
    			i3 = element("i");
    			t10 = space();
    			div9 = element("div");
    			div8 = element("div");
    			ul1 = element("ul");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "پست";
    			t12 = space();
    			li3 = element("li");
    			a3 = element("a");
    			a3.textContent = "درباره";
    			attr_dev(i0, "class", "fas fa-external-link-alt padding-button ml-2 icon-size-scroll");
    			add_location(i0, file$6, 45, 100, 1532);
    			attr_dev(button0, "class", "btn rounded-pill font btn-mw-scroll text-center visit-btn mx-0 ");
    			add_location(button0, file$6, 45, 20, 1452);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "data-toggle", "dropdown");
    			attr_dev(button1, "class", "pt-0 pl-md-5 pr-md-3 px-lg-3 btn btn-sm btn-mw-scroll rounded-pill col-12 font text-center col-md-7");
    			add_location(button1, file$6, 48, 24, 1746);
    			attr_dev(i1, "class", "fas fa-share-alt");
    			add_location(i1, file$6, 51, 44, 2050);
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$6, 51, 32, 2038);
    			add_location(li0, file$6, 51, 28, 2034);
    			attr_dev(i2, "class", "fas fa-flag");
    			add_location(i2, file$6, 52, 44, 2149);
    			attr_dev(a1, "href", "#");
    			add_location(a1, file$6, 52, 32, 2137);
    			add_location(li1, file$6, 52, 28, 2133);
    			attr_dev(ul0, "class", "dropdown-menu  ellipsis-menu");
    			add_location(ul0, file$6, 50, 24, 1964);
    			attr_dev(div0, "class", "col-5 mr-0 justify-content-start dropdown dropleft px-2");
    			add_location(div0, file$6, 47, 20, 1652);
    			attr_dev(div1, "class", "row justify-content-end");
    			add_location(div1, file$6, 44, 16, 1394);
    			attr_dev(div2, "class", "col-8 col-md-4 direction my-auto");
    			add_location(div2, file$6, 43, 12, 1330);
    			if (img.src !== (img_src_value = "image/afarine.jpg")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "class", "logo-cu-scroll");
    			attr_dev(img, "alt", "");
    			add_location(img, file$6, 60, 24, 2483);
    			attr_dev(div3, "class", "col-1 mr-3  my-auto");
    			add_location(div3, file$6, 59, 20, 2425);
    			set_style(i3, "color", "#048af7");
    			set_style(i3, "font-size", "13px");
    			attr_dev(i3, "class", "fas fa-check-circle");
    			add_location(i3, file$6, 63, 75, 2686);
    			attr_dev(h5, "class", "text-logo-scroll mt-2 mr-2");
    			add_location(h5, file$6, 63, 24, 2635);
    			attr_dev(div4, "class", "col-10");
    			add_location(div4, file$6, 62, 20, 2590);
    			attr_dev(div5, "class", "row mr-3 ");
    			add_location(div5, file$6, 58, 16, 2381);
    			attr_dev(div6, "class", "col-6  col-md-5 bg-light py-2  direction ");
    			add_location(div6, file$6, 57, 12, 2308);
    			attr_dev(div7, "class", "row justify-content-between shadow-sm mr-0");
    			add_location(div7, file$6, 42, 8, 1261);
    			attr_dev(a2, "class", "py-2 nav-link-scroll");
    			attr_dev(a2, "data-toggle", "tab");
    			attr_dev(a2, "href", "#post");
    			toggle_class(a2, "active", /*current*/ ctx[3] === "post");
    			add_location(a2, file$6, 71, 53, 3090);
    			attr_dev(li2, "class", "nav-item-scroll mt-2");
    			add_location(li2, file$6, 71, 20, 3057);
    			attr_dev(a3, "class", "py-2 nav-link-scroll");
    			attr_dev(a3, "data-toggle", "tab");
    			attr_dev(a3, "href", "#about");
    			toggle_class(a3, "active", /*current*/ ctx[3] === "about");
    			add_location(a3, file$6, 72, 53, 3287);
    			attr_dev(li3, "class", "nav-item-scroll mt-2");
    			add_location(li3, file$6, 72, 20, 3254);
    			attr_dev(ul1, "class", "nav nav-tabs direction text-center");
    			attr_dev(ul1, "role", "tablist");
    			add_location(ul1, file$6, 70, 16, 2974);
    			attr_dev(div8, "class", "row  mx-4 scroll-main-height");
    			add_location(div8, file$6, 69, 12, 2915);
    			attr_dev(div9, "class", "col-12 mt-0 scroll-main-height");
    			add_location(div9, file$6, 68, 8, 2858);
    			attr_dev(div10, "class", "col-12 scroll-div bg-light pr-0 mr-5 nav-custome-top");
    			add_location(div10, file$6, 41, 4, 1169);
    			attr_dev(section, "class", "row nav-mag-scroll pr-0 mr-0 bg-light mt-0 d-none d-md-inline");
    			add_location(section, file$6, 39, 0, 1078);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div10);
    			append_dev(div10, div7);
    			append_dev(div7, div2);
    			append_dev(div2, div1);
    			append_dev(div1, button0);
    			append_dev(button0, i0);
    			append_dev(button0, t0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, button1);
    			append_dev(div0, t3);
    			append_dev(div0, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a0);
    			append_dev(a0, i1);
    			append_dev(a0, t4);
    			append_dev(ul0, t5);
    			append_dev(ul0, li1);
    			append_dev(li1, a1);
    			append_dev(a1, i2);
    			append_dev(a1, t6);
    			append_dev(div7, t7);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, div3);
    			append_dev(div3, img);
    			append_dev(div5, t8);
    			append_dev(div5, div4);
    			append_dev(div4, h5);
    			append_dev(h5, t9);
    			append_dev(h5, i3);
    			append_dev(div10, t10);
    			append_dev(div10, div9);
    			append_dev(div9, div8);
    			append_dev(div8, ul1);
    			append_dev(ul1, li2);
    			append_dev(li2, a2);
    			append_dev(ul1, t12);
    			append_dev(ul1, li3);
    			append_dev(li3, a3);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(a2, "click", /*click_handler*/ ctx[6], false, false, false),
    					listen_dev(a3, "click", /*click_handler_1*/ ctx[7], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*current*/ 8) {
    				toggle_class(a2, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a3, "active", /*current*/ ctx[3] === "about");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div10_transition) div10_transition = create_bidirectional_transition(div10, slide, {}, true);
    				div10_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div10_transition) div10_transition = create_bidirectional_transition(div10, slide, {}, false);
    			div10_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			if (detaching && div10_transition) div10_transition.end();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(39:0) {#if y>600}",
    		ctx
    	});

    	return block;
    }

    // (357:40) {#if x<=767}
    function create_if_block$2(ctx) {
    	let button;
    	let span;

    	const block = {
    		c: function create() {
    			button = element("button");
    			span = element("span");
    			span.textContent = "×";
    			attr_dev(span, "class", "col-1 mt-1");
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file$6, 361, 48, 27173);
    			attr_dev(button, "type", "button");
    			attr_dev(button, "class", "close row mx-2 justify-content-end");
    			attr_dev(button, "data-dismiss", "modal");
    			attr_dev(button, "aria-label", "Close");
    			add_location(button, file$6, 357, 44, 26908);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, span);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(357:40) {#if x<=767}",
    		ctx
    	});

    	return block;
    }

    // (37:0) <Router url="{url}">
    function create_default_slot$2(ctx) {
    	let t0;
    	let main;
    	let div123;
    	let aside0;
    	let div3;
    	let div2;
    	let div1;
    	let div0;
    	let a0;
    	let img0;
    	let img0_src_value;
    	let t1;
    	let aside3;
    	let div16;
    	let div15;
    	let div14;
    	let div4;
    	let img1;
    	let img1_src_value;
    	let t2;
    	let div5;
    	let img2;
    	let img2_src_value;
    	let t3;
    	let div11;
    	let div10;
    	let div9;
    	let h30;
    	let t4;
    	let i0;
    	let t5;
    	let h60;
    	let i1;
    	let t6;
    	let t7;
    	let h61;
    	let t9;
    	let div8;
    	let div7;
    	let button0;
    	let i2;
    	let t10;
    	let t11;
    	let div6;
    	let button1;
    	let t13;
    	let ul0;
    	let li0;
    	let a1;
    	let i3;
    	let t14;
    	let t15;
    	let li1;
    	let a2;
    	let i4;
    	let t16;
    	let t17;
    	let div13;
    	let div12;
    	let ul1;
    	let li2;
    	let a3;
    	let t19;
    	let li3;
    	let a4;
    	let t21;
    	let div122;
    	let div100;
    	let div99;
    	let aside1;
    	let section;
    	let div56;
    	let article0;
    	let div24;
    	let div23;
    	let div21;
    	let div20;
    	let div17;
    	let img3;
    	let img3_src_value;
    	let t22;
    	let div19;
    	let div18;
    	let h62;
    	let a5;
    	let t23;
    	let i5;
    	let t24;
    	let span0;
    	let i6;
    	let t25;
    	let t26;
    	let div22;
    	let i7;
    	let t27;
    	let ul2;
    	let li4;
    	let a6;
    	let i8;
    	let t28;
    	let t29;
    	let li5;
    	let a7;
    	let i9;
    	let t30;
    	let t31;
    	let li6;
    	let a8;
    	let i10;
    	let t32;
    	let t33;
    	let div25;
    	let h31;
    	let a9;
    	let t35;
    	let div26;
    	let img4;
    	let img4_src_value;
    	let t36;
    	let p0;
    	let t37;
    	let span1;
    	let span2;
    	let t40;
    	let span3;
    	let t42;
    	let div27;
    	let a10;
    	let button2;
    	let t44;
    	let div29;
    	let a11;
    	let img5;
    	let img5_src_value;
    	let t45;
    	let span4;
    	let t47;
    	let t48;
    	let div28;
    	let i11;
    	let t49;
    	let t50;
    	let article1;
    	let div37;
    	let div36;
    	let div34;
    	let div33;
    	let div30;
    	let img6;
    	let img6_src_value;
    	let t51;
    	let div32;
    	let div31;
    	let h63;
    	let a12;
    	let t52;
    	let i12;
    	let t53;
    	let span5;
    	let i13;
    	let t54;
    	let t55;
    	let div35;
    	let i14;
    	let t56;
    	let ul3;
    	let li7;
    	let a13;
    	let i15;
    	let t57;
    	let t58;
    	let li8;
    	let a14;
    	let i16;
    	let t59;
    	let t60;
    	let li9;
    	let a15;
    	let i17;
    	let t61;
    	let t62;
    	let div38;
    	let h32;
    	let a16;
    	let t64;
    	let div39;
    	let img7;
    	let img7_src_value;
    	let t65;
    	let p1;
    	let t66;
    	let span6;
    	let span7;
    	let t69;
    	let span8;
    	let t71;
    	let div40;
    	let a17;
    	let button3;
    	let t73;
    	let hr0;
    	let t74;
    	let div42;
    	let a18;
    	let img8;
    	let img8_src_value;
    	let t75;
    	let span9;
    	let t77;
    	let t78;
    	let div41;
    	let i18;
    	let t79;
    	let t80;
    	let article2;
    	let div50;
    	let div49;
    	let div47;
    	let div46;
    	let div43;
    	let img9;
    	let img9_src_value;
    	let t81;
    	let div45;
    	let div44;
    	let h64;
    	let a19;
    	let t82;
    	let i19;
    	let t83;
    	let span10;
    	let i20;
    	let t84;
    	let t85;
    	let div48;
    	let i21;
    	let t86;
    	let ul4;
    	let li10;
    	let a20;
    	let i22;
    	let t87;
    	let t88;
    	let li11;
    	let a21;
    	let i23;
    	let t89;
    	let t90;
    	let li12;
    	let a22;
    	let i24;
    	let t91;
    	let t92;
    	let div51;
    	let h33;
    	let a23;
    	let t94;
    	let div52;
    	let img10;
    	let img10_src_value;
    	let t95;
    	let p2;
    	let t96;
    	let span11;
    	let span12;
    	let t99;
    	let span13;
    	let t101;
    	let div53;
    	let a24;
    	let button4;
    	let t103;
    	let hr1;
    	let t104;
    	let div55;
    	let a25;
    	let img11;
    	let img11_src_value;
    	let t105;
    	let span14;
    	let t107;
    	let t108;
    	let div54;
    	let i25;
    	let t109;
    	let t110;
    	let aside2;
    	let div58;
    	let div57;
    	let img12;
    	let img12_src_value;
    	let t111;
    	let h34;
    	let t113;
    	let h65;
    	let t115;
    	let div98;
    	let div59;
    	let a26;
    	let i26;
    	let t116;
    	let a26_type_value;
    	let a26_data_toggle_value;
    	let a26_data_target_value;
    	let span15;
    	let div59_class_value;
    	let t118;
    	let div97;
    	let div96;
    	let t119;
    	let div87;
    	let div60;
    	let h50;
    	let a27;
    	let t120;
    	let a28;
    	let p3;
    	let t122;
    	let div86;
    	let div85;
    	let div84;
    	let div83;
    	let div64;
    	let div61;
    	let h51;
    	let a29;
    	let t123;
    	let a30;
    	let p4;
    	let t125;
    	let div63;
    	let div62;
    	let t127;
    	let div68;
    	let div65;
    	let h52;
    	let a31;
    	let t128;
    	let a32;
    	let p5;
    	let t130;
    	let div67;
    	let div66;
    	let t132;
    	let div82;
    	let div69;
    	let h53;
    	let a33;
    	let t133;
    	let a34;
    	let p6;
    	let t135;
    	let div81;
    	let div80;
    	let div79;
    	let div78;
    	let div73;
    	let div70;
    	let h54;
    	let a35;
    	let t136;
    	let a36;
    	let p7;
    	let t138;
    	let div72;
    	let div71;
    	let t140;
    	let div77;
    	let div74;
    	let h55;
    	let a37;
    	let p8;
    	let t142;
    	let div76;
    	let div75;
    	let t144;
    	let div91;
    	let div88;
    	let h56;
    	let a38;
    	let t145;
    	let a39;
    	let p9;
    	let t147;
    	let div90;
    	let div89;
    	let t149;
    	let div95;
    	let div92;
    	let h57;
    	let a40;
    	let t150;
    	let a41;
    	let p10;
    	let t152;
    	let div94;
    	let div93;
    	let div96_class_value;
    	let div96_role_value;
    	let div97_class_value;
    	let div97_id_value;
    	let div97_tabindex_value;
    	let div97_role_value;
    	let div98_class_value;
    	let t154;
    	let div121;
    	let div120;
    	let div116;
    	let div115;
    	let h58;
    	let t156;
    	let p11;
    	let t158;
    	let div114;
    	let div113;
    	let div101;
    	let t160;
    	let div102;
    	let a42;
    	let t162;
    	let div103;
    	let t164;
    	let div104;
    	let t166;
    	let div105;
    	let t168;
    	let div106;
    	let t170;
    	let div107;
    	let t172;
    	let div108;
    	let t174;
    	let div109;
    	let t176;
    	let div110;
    	let t178;
    	let div111;
    	let t180;
    	let div112;
    	let t182;
    	let div119;
    	let div118;
    	let h59;
    	let t184;
    	let p12;
    	let t186;
    	let div117;
    	let main_transition;
    	let t187;
    	let br0;
    	let br1;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*y*/ ctx[1] > 600 && create_if_block_1$2(ctx);
    	let if_block1 = /*x*/ ctx[0] <= 767 && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			main = element("main");
    			div123 = element("div");
    			aside0 = element("aside");
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			a0 = element("a");
    			img0 = element("img");
    			t1 = space();
    			aside3 = element("aside");
    			div16 = element("div");
    			div15 = element("div");
    			div14 = element("div");
    			div4 = element("div");
    			img1 = element("img");
    			t2 = space();
    			div5 = element("div");
    			img2 = element("img");
    			t3 = space();
    			div11 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			h30 = element("h3");
    			t4 = text("آفرینه ");
    			i0 = element("i");
    			t5 = space();
    			h60 = element("h6");
    			i1 = element("i");
    			t6 = text(" تهران,شهرک طالقانی,ساحتمان نگین");
    			t7 = space();
    			h61 = element("h6");
    			h61.textContent = "به آفرینه محلق شوید و بروز باشید .می توانید مطالب مرتبط به کارآفرینی و بازاریابی رو از اینجا دنبال کنید اگر از محتوای ما خوشتان اومد آنرا  با دیگران به اشتراک بگذارید.";
    			t9 = space();
    			div8 = element("div");
    			div7 = element("div");
    			button0 = element("button");
    			i2 = element("i");
    			t10 = text("بازدید سایت");
    			t11 = space();
    			div6 = element("div");
    			button1 = element("button");
    			button1.textContent = "بیشتر";
    			t13 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a1 = element("a");
    			i3 = element("i");
    			t14 = text(" اشتراک صفحه");
    			t15 = space();
    			li1 = element("li");
    			a2 = element("a");
    			i4 = element("i");
    			t16 = text(" گزارش دادن");
    			t17 = space();
    			div13 = element("div");
    			div12 = element("div");
    			ul1 = element("ul");
    			li2 = element("li");
    			a3 = element("a");
    			a3.textContent = "پست";
    			t19 = space();
    			li3 = element("li");
    			a4 = element("a");
    			a4.textContent = "درباره";
    			t21 = space();
    			div122 = element("div");
    			div100 = element("div");
    			div99 = element("div");
    			aside1 = element("aside");
    			section = element("section");
    			div56 = element("div");
    			article0 = element("article");
    			div24 = element("div");
    			div23 = element("div");
    			div21 = element("div");
    			div20 = element("div");
    			div17 = element("div");
    			img3 = element("img");
    			t22 = space();
    			div19 = element("div");
    			div18 = element("div");
    			h62 = element("h6");
    			a5 = element("a");
    			t23 = text("مرکز رشد و نواوری آفرینه ");
    			i5 = element("i");
    			t24 = space();
    			span0 = element("span");
    			i6 = element("i");
    			t25 = text(" ۳ دقیقه قبل");
    			t26 = space();
    			div22 = element("div");
    			i7 = element("i");
    			t27 = space();
    			ul2 = element("ul");
    			li4 = element("li");
    			a6 = element("a");
    			i8 = element("i");
    			t28 = text(" ذخیره کردن پست");
    			t29 = space();
    			li5 = element("li");
    			a7 = element("a");
    			i9 = element("i");
    			t30 = text(" کپی کردن لینک");
    			t31 = space();
    			li6 = element("li");
    			a8 = element("a");
    			i10 = element("i");
    			t32 = text(" گزارش دادن");
    			t33 = space();
    			div25 = element("div");
    			h31 = element("h3");
    			a9 = element("a");
    			a9.textContent = "به اینولینکس خوش آمدید";
    			t35 = space();
    			div26 = element("div");
    			img4 = element("img");
    			t36 = space();
    			p0 = element("p");
    			t37 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span1 = element("span");
    			span1.textContent = "...";
    			span2 = element("span");
    			span2.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t40 = space();
    			span3 = element("span");
    			span3.textContent = "بیشتر بخوانید";
    			t42 = space();
    			div27 = element("div");
    			a10 = element("a");
    			button2 = element("button");
    			button2.textContent = "ادامه مطلب";
    			t44 = space();
    			div29 = element("div");
    			a11 = element("a");
    			img5 = element("img");
    			t45 = space();
    			span4 = element("span");
    			span4.textContent = "مسعودآقایی ساداتی";
    			t47 = text("  ");
    			t48 = space();
    			div28 = element("div");
    			i11 = element("i");
    			t49 = text(" ۵۶");
    			t50 = space();
    			article1 = element("article");
    			div37 = element("div");
    			div36 = element("div");
    			div34 = element("div");
    			div33 = element("div");
    			div30 = element("div");
    			img6 = element("img");
    			t51 = space();
    			div32 = element("div");
    			div31 = element("div");
    			h63 = element("h6");
    			a12 = element("a");
    			t52 = text("مرکز رشد و نواوری آفرینه ");
    			i12 = element("i");
    			t53 = space();
    			span5 = element("span");
    			i13 = element("i");
    			t54 = text(" ۸ روز قبل");
    			t55 = space();
    			div35 = element("div");
    			i14 = element("i");
    			t56 = space();
    			ul3 = element("ul");
    			li7 = element("li");
    			a13 = element("a");
    			i15 = element("i");
    			t57 = text(" ذخیره کردن پست");
    			t58 = space();
    			li8 = element("li");
    			a14 = element("a");
    			i16 = element("i");
    			t59 = text(" کپی کردن لینک");
    			t60 = space();
    			li9 = element("li");
    			a15 = element("a");
    			i17 = element("i");
    			t61 = text(" گزارش دادن");
    			t62 = space();
    			div38 = element("div");
    			h32 = element("h3");
    			a16 = element("a");
    			a16.textContent = "نگاهی اجمالی به آخرین دستاوردهای شبکه اجتماعی فیس بوک";
    			t64 = space();
    			div39 = element("div");
    			img7 = element("img");
    			t65 = space();
    			p1 = element("p");
    			t66 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span6 = element("span");
    			span6.textContent = "...";
    			span7 = element("span");
    			span7.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t69 = space();
    			span8 = element("span");
    			span8.textContent = "بیشتر بخوانید";
    			t71 = space();
    			div40 = element("div");
    			a17 = element("a");
    			button3 = element("button");
    			button3.textContent = "ادامه مطلب";
    			t73 = space();
    			hr0 = element("hr");
    			t74 = space();
    			div42 = element("div");
    			a18 = element("a");
    			img8 = element("img");
    			t75 = space();
    			span9 = element("span");
    			span9.textContent = "مسعودآقایی ساداتی";
    			t77 = text("  ");
    			t78 = space();
    			div41 = element("div");
    			i18 = element("i");
    			t79 = text(" ۱۴۲");
    			t80 = space();
    			article2 = element("article");
    			div50 = element("div");
    			div49 = element("div");
    			div47 = element("div");
    			div46 = element("div");
    			div43 = element("div");
    			img9 = element("img");
    			t81 = space();
    			div45 = element("div");
    			div44 = element("div");
    			h64 = element("h6");
    			a19 = element("a");
    			t82 = text("مرکز رشد و نواوری آفرینه ");
    			i19 = element("i");
    			t83 = space();
    			span10 = element("span");
    			i20 = element("i");
    			t84 = text(" ۳ دقیقه قبل");
    			t85 = space();
    			div48 = element("div");
    			i21 = element("i");
    			t86 = space();
    			ul4 = element("ul");
    			li10 = element("li");
    			a20 = element("a");
    			i22 = element("i");
    			t87 = text(" ذخیره کردن پست");
    			t88 = space();
    			li11 = element("li");
    			a21 = element("a");
    			i23 = element("i");
    			t89 = text(" کپی کردن لینک");
    			t90 = space();
    			li12 = element("li");
    			a22 = element("a");
    			i24 = element("i");
    			t91 = text(" گزارش دادن");
    			t92 = space();
    			div51 = element("div");
    			h33 = element("h3");
    			a23 = element("a");
    			a23.textContent = "راه های مدیریت کسب و کار الکترونیکی";
    			t94 = space();
    			div52 = element("div");
    			img10 = element("img");
    			t95 = space();
    			p2 = element("p");
    			t96 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span11 = element("span");
    			span11.textContent = "...";
    			span12 = element("span");
    			span12.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t99 = space();
    			span13 = element("span");
    			span13.textContent = "بیشتر بخوانید";
    			t101 = space();
    			div53 = element("div");
    			a24 = element("a");
    			button4 = element("button");
    			button4.textContent = "ادامه مطلب";
    			t103 = space();
    			hr1 = element("hr");
    			t104 = space();
    			div55 = element("div");
    			a25 = element("a");
    			img11 = element("img");
    			t105 = space();
    			span14 = element("span");
    			span14.textContent = "مجتبی اکبری";
    			t107 = text("  ");
    			t108 = space();
    			div54 = element("div");
    			i25 = element("i");
    			t109 = text(" ۱۲");
    			t110 = space();
    			aside2 = element("aside");
    			div58 = element("div");
    			div57 = element("div");
    			img12 = element("img");
    			t111 = space();
    			h34 = element("h3");
    			h34.textContent = "آفرینه";
    			t113 = space();
    			h65 = element("h6");
    			h65.textContent = "زندگی به سبک نوآوری";
    			t115 = space();
    			div98 = element("div");
    			div59 = element("div");
    			a26 = element("a");
    			i26 = element("i");
    			t116 = space();
    			span15 = element("span");
    			span15.textContent = "دسته بندی";
    			t118 = space();
    			div97 = element("div");
    			div96 = element("div");
    			if (if_block1) if_block1.c();
    			t119 = space();
    			div87 = element("div");
    			div60 = element("div");
    			h50 = element("h5");
    			a27 = element("a");
    			t120 = space();
    			a28 = element("a");
    			p3 = element("p");
    			p3.textContent = "بازاریابی";
    			t122 = space();
    			div86 = element("div");
    			div85 = element("div");
    			div84 = element("div");
    			div83 = element("div");
    			div64 = element("div");
    			div61 = element("div");
    			h51 = element("h5");
    			a29 = element("a");
    			t123 = space();
    			a30 = element("a");
    			p4 = element("p");
    			p4.textContent = "کسب و کار";
    			t125 = space();
    			div63 = element("div");
    			div62 = element("div");
    			div62.textContent = "فوتبال";
    			t127 = space();
    			div68 = element("div");
    			div65 = element("div");
    			h52 = element("h5");
    			a31 = element("a");
    			t128 = space();
    			a32 = element("a");
    			p5 = element("p");
    			p5.textContent = "مدیریت تلکنولوژی";
    			t130 = space();
    			div67 = element("div");
    			div66 = element("div");
    			div66.textContent = "خاورمیانه";
    			t132 = space();
    			div82 = element("div");
    			div69 = element("div");
    			h53 = element("h5");
    			a33 = element("a");
    			t133 = space();
    			a34 = element("a");
    			p6 = element("p");
    			p6.textContent = "آرشیو کلیپ ها";
    			t135 = space();
    			div81 = element("div");
    			div80 = element("div");
    			div79 = element("div");
    			div78 = element("div");
    			div73 = element("div");
    			div70 = element("div");
    			h54 = element("h5");
    			a35 = element("a");
    			t136 = space();
    			a36 = element("a");
    			p7 = element("p");
    			p7.textContent = "کسب و کار";
    			t138 = space();
    			div72 = element("div");
    			div71 = element("div");
    			div71.textContent = "فوتبال";
    			t140 = space();
    			div77 = element("div");
    			div74 = element("div");
    			h55 = element("h5");
    			a37 = element("a");
    			p8 = element("p");
    			p8.textContent = "مدیریت تلکنولوژی";
    			t142 = space();
    			div76 = element("div");
    			div75 = element("div");
    			div75.textContent = "خاورمیانه";
    			t144 = space();
    			div91 = element("div");
    			div88 = element("div");
    			h56 = element("h5");
    			a38 = element("a");
    			t145 = space();
    			a39 = element("a");
    			p9 = element("p");
    			p9.textContent = "مدیریت تلکنولوژی";
    			t147 = space();
    			div90 = element("div");
    			div89 = element("div");
    			div89.textContent = "خاورمیانه";
    			t149 = space();
    			div95 = element("div");
    			div92 = element("div");
    			h57 = element("h5");
    			a40 = element("a");
    			t150 = space();
    			a41 = element("a");
    			p10 = element("p");
    			p10.textContent = "آرشیو کلیپ ها";
    			t152 = space();
    			div94 = element("div");
    			div93 = element("div");
    			div93.textContent = "راهیان نور";
    			t154 = space();
    			div121 = element("div");
    			div120 = element("div");
    			div116 = element("div");
    			div115 = element("div");
    			h58 = element("h5");
    			h58.textContent = "درباره آفرینه";
    			t156 = space();
    			p11 = element("p");
    			p11.textContent = "لورم ایپسوم یک متن ساختگی برای طراحی و نمایش محتوای بی ربط است اما این متن نوشته شده هیچ ربطی به لورم ایپسوم ندارد.\n                                    این چیزی که میبینید صرفا یک متن ساختگی تر نسبت به لورم ایپسوم است تا شما بتواندی با گرفتن خروجی در سایت و موبایل یا هر دستگاه دیگر خروجی بگیرید و نگاه کنید که ساختار کد نوشتاری سایت با لورم به چه صورتی در آمده است.\n                                    با تشکر از سایت ساختگی نوشتار لورم ایپسوم آقای بوق";
    			t158 = space();
    			div114 = element("div");
    			div113 = element("div");
    			div101 = element("div");
    			div101.textContent = "وبسایت";
    			t160 = space();
    			div102 = element("div");
    			a42 = element("a");
    			a42.textContent = "http://afarine.com/";
    			t162 = space();
    			div103 = element("div");
    			div103.textContent = "نوع فعالیت";
    			t164 = space();
    			div104 = element("div");
    			div104.textContent = "کارآفرینی و کسب و کار - خصوصی";
    			t166 = space();
    			div105 = element("div");
    			div105.textContent = "میزان استخدام";
    			t168 = space();
    			div106 = element("div");
    			div106.textContent = "۱۲۰ + کارمند";
    			t170 = space();
    			div107 = element("div");
    			div107.textContent = "تاریخ تاسیس";
    			t172 = space();
    			div108 = element("div");
    			div108.textContent = "۲۰۱۸";
    			t174 = space();
    			div109 = element("div");
    			div109.textContent = "تخصص ها";
    			t176 = space();
    			div110 = element("div");
    			div110.textContent = "اشتغال/بازاریابی/کسب و کار/";
    			t178 = space();
    			div111 = element("div");
    			div111.textContent = "آدرس اصلی";
    			t180 = space();
    			div112 = element("div");
    			div112.textContent = "تهران,شهرک طالقانی,ساحتمان نگین";
    			t182 = space();
    			div119 = element("div");
    			div118 = element("div");
    			h59 = element("h5");
    			h59.textContent = "موقعیت مکانی آفرینه";
    			t184 = space();
    			p12 = element("p");
    			p12.textContent = "برای یافتن مکان دقیق باید زوم کنید";
    			t186 = space();
    			div117 = element("div");
    			t187 = space();
    			br0 = element("br");
    			br1 = element("br");
    			attr_dev(img0, "class", "w-100 dream-job-image");
    			if (img0.src !== (img0_src_value = "image/job.jpg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$6, 92, 32, 3986);
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$6, 91, 28, 3941);
    			attr_dev(div0, "class", "col-12 my-1");
    			add_location(div0, file$6, 90, 24, 3887);
    			attr_dev(div1, "class", "row ");
    			add_location(div1, file$6, 89, 20, 3844);
    			attr_dev(div2, "class", "col-12 shadow-radius-section bg-light");
    			add_location(div2, file$6, 88, 16, 3772);
    			attr_dev(div3, "class", "row");
    			add_location(div3, file$6, 87, 12, 3738);
    			attr_dev(aside0, "class", "col-12 col-md-3 mr-2 d-none d-lg-inline");
    			add_location(aside0, file$6, 86, 8, 3669);
    			attr_dev(img1, "class", " header-image-person bg-light");
    			if (img1.src !== (img1_src_value = "image/head.jpeg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$6, 104, 28, 4477);
    			attr_dev(div4, "class", "col-12 p-0 banner");
    			add_location(div4, file$6, 103, 24, 4416);
    			attr_dev(img2, "class", "header-logo-image-person border-radius");
    			if (img2.src !== (img2_src_value = "image/1.jpeg")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "alt", "");
    			add_location(img2, file$6, 107, 28, 4686);
    			attr_dev(div5, "class", "col-12 header-image-main border-radius");
    			add_location(div5, file$6, 106, 24, 4605);
    			set_style(i0, "color", "#048af7");
    			set_style(i0, "font-size", "20px");
    			attr_dev(i0, "class", "fas fa-check-circle");
    			add_location(i0, file$6, 112, 70, 5024);
    			attr_dev(h30, "class", "text-bold");
    			add_location(h30, file$6, 112, 36, 4990);
    			attr_dev(i1, "class", "fas fa-map-marker-alt");
    			add_location(i1, file$6, 113, 63, 5167);
    			attr_dev(h60, "class", "text-secondary");
    			add_location(h60, file$6, 113, 36, 5140);
    			attr_dev(h61, "class", "explain-about-page");
    			add_location(h61, file$6, 114, 36, 5283);
    			attr_dev(i2, "class", "fas fa-external-link-alt padding-button ml-2 icon-size");
    			add_location(i2, file$6, 117, 120, 5732);
    			attr_dev(button0, "class", "btn  rounded-pill  font btn-mw text-center visit-btn mx-1  ");
    			add_location(button0, file$6, 117, 44, 5656);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "data-toggle", "dropdown");
    			attr_dev(button1, "class", "pt-custome-more-btn btn btn-mw rounded-pill col-12 font text-center col-md-6 ");
    			add_location(button1, file$6, 119, 48, 5981);
    			attr_dev(i3, "class", "fas fa-share-alt");
    			add_location(i3, file$6, 121, 68, 6285);
    			attr_dev(a1, "href", "#");
    			add_location(a1, file$6, 121, 56, 6273);
    			add_location(li0, file$6, 121, 52, 6269);
    			attr_dev(i4, "class", "fas fa-flag");
    			add_location(i4, file$6, 122, 68, 6408);
    			attr_dev(a2, "href", "#");
    			add_location(a2, file$6, 122, 56, 6396);
    			add_location(li1, file$6, 122, 52, 6392);
    			attr_dev(ul0, "class", "dropdown-menu  ellipsis-menu");
    			add_location(ul0, file$6, 120, 48, 6175);
    			attr_dev(div6, "class", "col-5 justify-content-start dropdown dropleft pr-1");
    			add_location(div6, file$6, 118, 44, 5868);
    			attr_dev(div7, "class", "row");
    			add_location(div7, file$6, 116, 40, 5594);
    			attr_dev(div8, "class", "col-12 mt-4 font");
    			add_location(div8, file$6, 115, 36, 5523);
    			attr_dev(div9, "class", "col-10");
    			add_location(div9, file$6, 111, 32, 4933);
    			attr_dev(div10, "class", "row");
    			add_location(div10, file$6, 110, 28, 4883);
    			attr_dev(div11, "class", "header-detail col-12");
    			add_location(div11, file$6, 109, 24, 4820);
    			attr_dev(a3, "class", "py-2 nav-link-scroll");
    			attr_dev(a3, "data-toggle", "tab");
    			attr_dev(a3, "href", "#post");
    			toggle_class(a3, "active", /*current*/ ctx[3] === "post");
    			add_location(a3, file$6, 135, 73, 7139);
    			attr_dev(li2, "class", "nav-item-scroll mt-2");
    			add_location(li2, file$6, 135, 40, 7106);
    			attr_dev(a4, "class", "py-2 nav-link-scroll");
    			attr_dev(a4, "data-toggle", "tab");
    			attr_dev(a4, "href", "#about");
    			toggle_class(a4, "active", /*current*/ ctx[3] === "about");
    			add_location(a4, file$6, 136, 73, 7357);
    			attr_dev(li3, "class", "nav-item-scroll mt-2");
    			add_location(li3, file$6, 136, 40, 7324);
    			attr_dev(ul1, "class", "nav nav-tabs direction text-center");
    			attr_dev(ul1, "role", "tablist");
    			add_location(ul1, file$6, 134, 36, 7003);
    			attr_dev(div12, "class", "row  scroll-main-height");
    			add_location(div12, file$6, 133, 32, 6929);
    			attr_dev(div13, "class", "col-12 tab-header-main mt-3 ");
    			add_location(div13, file$6, 132, 28, 6854);
    			attr_dev(div14, "class", "row p-0 shadow-radius-section bg-white");
    			add_location(div14, file$6, 102, 20, 4338);
    			attr_dev(div15, "class", "col-12 ");
    			add_location(div15, file$6, 101, 16, 4296);
    			attr_dev(div16, "class", "row ml-md-1 ");
    			add_location(div16, file$6, 100, 12, 4253);
    			attr_dev(img3, "class", "cu-image-com mr-1 ");
    			if (img3.src !== (img3_src_value = "image/afarine.jpg")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "alt", "");
    			add_location(img3, file$6, 156, 60, 8758);
    			attr_dev(div17, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div17, file$6, 155, 56, 8641);
    			set_style(i5, "color", "#048af7");
    			attr_dev(i5, "class", "fas fa-check-circle");
    			add_location(i5, file$6, 160, 134, 9241);
    			attr_dev(a5, "href", "#");
    			attr_dev(a5, "class", "title-post-link");
    			add_location(a5, file$6, 160, 68, 9175);
    			add_location(h62, file$6, 160, 64, 9171);
    			attr_dev(i6, "class", "fas fa-clock");
    			add_location(i6, file$6, 161, 96, 9405);
    			attr_dev(span0, "class", "show-time-custome");
    			add_location(span0, file$6, 161, 64, 9373);
    			attr_dev(div18, "class", "cu-intro mt-2");
    			add_location(div18, file$6, 159, 60, 9079);
    			attr_dev(div19, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center ");
    			add_location(div19, file$6, 158, 56, 8941);
    			attr_dev(div20, "class", "row ");
    			add_location(div20, file$6, 154, 52, 8566);
    			attr_dev(div21, "class", "col-11 col-md-11");
    			add_location(div21, file$6, 153, 48, 8482);
    			attr_dev(i7, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i7, "type", "button");
    			attr_dev(i7, "data-toggle", "dropdown");
    			add_location(i7, file$6, 167, 52, 9858);
    			attr_dev(i8, "class", "far fa-bookmark");
    			add_location(i8, file$6, 169, 136, 10162);
    			attr_dev(a6, "class", "dropdown-item");
    			attr_dev(a6, "href", "#");
    			add_location(a6, file$6, 169, 101, 10127);
    			add_location(li4, file$6, 169, 56, 10082);
    			attr_dev(i9, "class", "fas fa-share-alt");
    			add_location(i9, file$6, 170, 94, 10313);
    			attr_dev(a7, "class", "dropdown-item");
    			attr_dev(a7, "href", "#");
    			add_location(a7, file$6, 170, 60, 10279);
    			add_location(li5, file$6, 170, 56, 10275);
    			attr_dev(i10, "class", "fas fa-flag");
    			add_location(i10, file$6, 171, 94, 10464);
    			attr_dev(a8, "class", "dropdown-item");
    			attr_dev(a8, "href", "#");
    			add_location(a8, file$6, 171, 60, 10430);
    			add_location(li6, file$6, 171, 56, 10426);
    			attr_dev(ul2, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul2, file$6, 168, 52, 9985);
    			attr_dev(div22, "class", "col-1 ml-0 pl-0 pr-4  pr-md-3 pr-lg-4 dropdown");
    			add_location(div22, file$6, 166, 48, 9745);
    			attr_dev(div23, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div23, file$6, 152, 44, 8375);
    			attr_dev(div24, "class", "col-12");
    			add_location(div24, file$6, 151, 40, 8310);
    			attr_dev(a9, "class", "title-post-link");
    			attr_dev(a9, "href", "profile/show-detail");
    			add_location(a9, file$6, 178, 88, 10917);
    			attr_dev(h31, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h31, file$6, 178, 44, 10873);
    			attr_dev(div25, "class", "col-12 p-0");
    			add_location(div25, file$6, 177, 40, 10804);
    			if (img4.src !== (img4_src_value = "image/30.jpg")) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img4, "alt", "");
    			add_location(img4, file$6, 181, 44, 11192);
    			attr_dev(div26, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div26, file$6, 180, 40, 11090);
    			attr_dev(span1, "id", "dots");
    			add_location(span1, file$6, 187, 130, 11835);
    			attr_dev(span2, "id", "more");
    			add_location(span2, file$6, 187, 156, 11861);
    			attr_dev(span3, "id", "myBtn");
    			set_style(span3, "cursor", "pointer");
    			add_location(span3, file$6, 194, 44, 12636);
    			attr_dev(p0, "class", "col-12 mt-3 post-text");
    			add_location(p0, file$6, 184, 40, 11403);
    			attr_dev(button2, "id", "read-more");
    			attr_dev(button2, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button2, file$6, 199, 48, 12978);
    			attr_dev(a10, "href", "#");
    			add_location(a10, file$6, 198, 44, 12917);
    			attr_dev(div27, "class", "col-12 ");
    			add_location(div27, file$6, 197, 40, 12851);
    			attr_dev(img5, "class", "personal-img");
    			if (img5.src !== (img5_src_value = "image/1.jpeg")) attr_dev(img5, "src", img5_src_value);
    			attr_dev(img5, "alt", "");
    			add_location(img5, file$6, 205, 48, 13445);
    			attr_dev(span4, "class", "personal-name");
    			add_location(span4, file$6, 206, 48, 13546);
    			attr_dev(a11, "class", "a-clicked");
    			attr_dev(a11, "href", "#");
    			add_location(a11, file$6, 204, 44, 13366);
    			attr_dev(i11, "class", "fas fa-eye");
    			add_location(i11, file$6, 208, 68, 13729);
    			attr_dev(div28, "class", "view-count");
    			add_location(div28, file$6, 208, 44, 13705);
    			attr_dev(div29, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div29, file$6, 203, 40, 13275);
    			attr_dev(article0, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article0, file$6, 150, 36, 8196);
    			attr_dev(img6, "class", "cu-image-com mr-1 ");
    			if (img6.src !== (img6_src_value = "image/afarine.jpg")) attr_dev(img6, "src", img6_src_value);
    			attr_dev(img6, "alt", "");
    			add_location(img6, file$6, 217, 60, 14443);
    			attr_dev(div30, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div30, file$6, 216, 56, 14326);
    			set_style(i12, "color", "#048af7");
    			attr_dev(i12, "class", "fas fa-check-circle");
    			add_location(i12, file$6, 221, 110, 14901);
    			attr_dev(a12, "href", "#");
    			add_location(a12, file$6, 221, 68, 14859);
    			add_location(h63, file$6, 221, 64, 14855);
    			attr_dev(i13, "class", "fas fa-clock");
    			add_location(i13, file$6, 222, 96, 15065);
    			attr_dev(span5, "class", "show-time-custome");
    			add_location(span5, file$6, 222, 64, 15033);
    			attr_dev(div31, "class", "cu-intro mt-2");
    			add_location(div31, file$6, 220, 60, 14763);
    			attr_dev(div32, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center");
    			add_location(div32, file$6, 219, 56, 14626);
    			attr_dev(div33, "class", "row ");
    			add_location(div33, file$6, 215, 52, 14251);
    			attr_dev(div34, "class", "col-11 col-md-11");
    			add_location(div34, file$6, 214, 48, 14167);
    			attr_dev(i14, "class", "fas fa-ellipsis-v ");
    			attr_dev(i14, "type", "button");
    			attr_dev(i14, "data-toggle", "dropdown");
    			add_location(i14, file$6, 228, 48, 15495);
    			attr_dev(i15, "class", "far fa-bookmark");
    			add_location(i15, file$6, 230, 109, 15765);
    			attr_dev(a13, "href", "#");
    			add_location(a13, file$6, 230, 97, 15753);
    			add_location(li7, file$6, 230, 52, 15708);
    			attr_dev(i16, "class", "fas fa-share-alt");
    			add_location(i16, file$6, 231, 68, 15890);
    			attr_dev(a14, "href", "#");
    			add_location(a14, file$6, 231, 56, 15878);
    			add_location(li8, file$6, 231, 52, 15874);
    			attr_dev(i17, "class", "fas fa-flag");
    			add_location(i17, file$6, 232, 68, 16015);
    			attr_dev(a15, "href", "#");
    			add_location(a15, file$6, 232, 56, 16003);
    			add_location(li9, file$6, 232, 52, 15999);
    			attr_dev(ul3, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul3, file$6, 229, 48, 15615);
    			attr_dev(div35, "class", "col-1 ml-0 pl-0 pr-4 dropdown");
    			add_location(div35, file$6, 227, 48, 15403);
    			attr_dev(div36, "class", "row justify-content-between p-2");
    			add_location(div36, file$6, 213, 44, 14073);
    			attr_dev(div37, "class", "col-12");
    			add_location(div37, file$6, 212, 40, 14008);
    			attr_dev(a16, "href", "#");
    			add_location(a16, file$6, 238, 88, 16423);
    			attr_dev(h32, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h32, file$6, 238, 44, 16379);
    			attr_dev(div38, "class", "col-12 p-0");
    			add_location(div38, file$6, 237, 40, 16310);
    			if (img7.src !== (img7_src_value = "image/28.jpg")) attr_dev(img7, "src", img7_src_value);
    			attr_dev(img7, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img7, "alt", "");
    			add_location(img7, file$6, 241, 44, 16688);
    			attr_dev(div39, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div39, file$6, 240, 40, 16586);
    			attr_dev(span6, "id", "dots");
    			add_location(span6, file$6, 247, 130, 17331);
    			attr_dev(span7, "id", "more");
    			add_location(span7, file$6, 247, 156, 17357);
    			attr_dev(span8, "id", "myBtn");
    			set_style(span8, "cursor", "pointer");
    			add_location(span8, file$6, 254, 44, 18132);
    			attr_dev(p1, "class", "col-12 mt-3 post-text");
    			add_location(p1, file$6, 244, 40, 16899);
    			attr_dev(button3, "id", "read-more");
    			attr_dev(button3, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button3, file$6, 259, 48, 18474);
    			attr_dev(a17, "href", "#");
    			add_location(a17, file$6, 258, 44, 18413);
    			attr_dev(div40, "class", "col-12 ");
    			add_location(div40, file$6, 257, 40, 18347);
    			attr_dev(hr0, "class", "col-11 mx-auto");
    			add_location(hr0, file$6, 262, 40, 18730);
    			attr_dev(img8, "class", "personal-img");
    			if (img8.src !== (img8_src_value = "image/1.jpeg")) attr_dev(img8, "src", img8_src_value);
    			attr_dev(img8, "alt", "");
    			add_location(img8, file$6, 265, 48, 18947);
    			attr_dev(span9, "class", "personal-name");
    			add_location(span9, file$6, 266, 48, 19048);
    			attr_dev(a18, "class", "a-clicked");
    			attr_dev(a18, "href", "#");
    			add_location(a18, file$6, 264, 44, 18868);
    			attr_dev(i18, "class", "fas fa-eye");
    			add_location(i18, file$6, 268, 68, 19231);
    			attr_dev(div41, "class", "view-count");
    			add_location(div41, file$6, 268, 44, 19207);
    			attr_dev(div42, "class", "col-12 mb-3");
    			add_location(div42, file$6, 263, 40, 18798);
    			attr_dev(article1, "class", "p-0 shadow-radius-section shadow-section mb-3 bg-light");
    			add_location(article1, file$6, 211, 36, 13895);
    			attr_dev(img9, "class", "cu-image-com mr-1 ");
    			if (img9.src !== (img9_src_value = "image/afarine.jpg")) attr_dev(img9, "src", img9_src_value);
    			attr_dev(img9, "alt", "");
    			add_location(img9, file$6, 277, 60, 19946);
    			attr_dev(div43, "class", "col-2 col-sm-1 col-md-2 col-lg-1 p-0 pt-1");
    			add_location(div43, file$6, 276, 56, 19829);
    			set_style(i19, "color", "#048af7");
    			attr_dev(i19, "class", "fas fa-check-circle");
    			add_location(i19, file$6, 281, 110, 20404);
    			attr_dev(a19, "href", "#");
    			add_location(a19, file$6, 281, 68, 20362);
    			add_location(h64, file$6, 281, 64, 20358);
    			attr_dev(i20, "class", "fas fa-clock");
    			add_location(i20, file$6, 282, 96, 20568);
    			attr_dev(span10, "class", "show-time-custome");
    			add_location(span10, file$6, 282, 64, 20536);
    			attr_dev(div44, "class", "cu-intro mt-2");
    			add_location(div44, file$6, 280, 60, 20266);
    			attr_dev(div45, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 mr-lg-4 justify-content-center");
    			add_location(div45, file$6, 279, 56, 20129);
    			attr_dev(div46, "class", "row ");
    			add_location(div46, file$6, 275, 52, 19754);
    			attr_dev(div47, "class", "col-11 col-md-11");
    			add_location(div47, file$6, 274, 48, 19670);
    			attr_dev(i21, "class", "fas fa-ellipsis-v ");
    			attr_dev(i21, "type", "button");
    			attr_dev(i21, "data-toggle", "dropdown");
    			add_location(i21, file$6, 288, 48, 21000);
    			attr_dev(i22, "class", "far fa-bookmark");
    			add_location(i22, file$6, 290, 109, 21270);
    			attr_dev(a20, "href", "#");
    			add_location(a20, file$6, 290, 97, 21258);
    			add_location(li10, file$6, 290, 52, 21213);
    			attr_dev(i23, "class", "fas fa-share-alt");
    			add_location(i23, file$6, 291, 68, 21395);
    			attr_dev(a21, "href", "#");
    			add_location(a21, file$6, 291, 56, 21383);
    			add_location(li11, file$6, 291, 52, 21379);
    			attr_dev(i24, "class", "fas fa-flag");
    			add_location(i24, file$6, 292, 68, 21520);
    			attr_dev(a22, "href", "#");
    			add_location(a22, file$6, 292, 56, 21508);
    			add_location(li12, file$6, 292, 52, 21504);
    			attr_dev(ul4, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul4, file$6, 289, 48, 21120);
    			attr_dev(div48, "class", "col-1 ml-0 pl-0 pr-4 dropdown");
    			add_location(div48, file$6, 287, 48, 20908);
    			attr_dev(div49, "class", "row justify-content-between p-2");
    			add_location(div49, file$6, 273, 44, 19576);
    			attr_dev(div50, "class", "col-12");
    			add_location(div50, file$6, 272, 40, 19511);
    			attr_dev(a23, "href", "#");
    			add_location(a23, file$6, 298, 88, 21928);
    			attr_dev(h33, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h33, file$6, 298, 44, 21884);
    			attr_dev(div51, "class", "col-12 p-0");
    			add_location(div51, file$6, 297, 40, 21815);
    			if (img10.src !== (img10_src_value = "../image/20.jpg")) attr_dev(img10, "src", img10_src_value);
    			attr_dev(img10, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img10, "alt", "");
    			add_location(img10, file$6, 301, 44, 22174);
    			attr_dev(div52, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div52, file$6, 300, 40, 22072);
    			attr_dev(span11, "id", "dots");
    			add_location(span11, file$6, 307, 130, 22820);
    			attr_dev(span12, "id", "more");
    			add_location(span12, file$6, 307, 156, 22846);
    			attr_dev(span13, "id", "myBtn");
    			set_style(span13, "cursor", "pointer");
    			add_location(span13, file$6, 314, 44, 23621);
    			attr_dev(p2, "class", "col-12 mt-3 post-text");
    			add_location(p2, file$6, 304, 40, 22388);
    			attr_dev(button4, "id", "read-more");
    			attr_dev(button4, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button4, file$6, 319, 48, 23963);
    			attr_dev(a24, "href", "#");
    			add_location(a24, file$6, 318, 44, 23902);
    			attr_dev(div53, "class", "col-12 ");
    			add_location(div53, file$6, 317, 40, 23836);
    			attr_dev(hr1, "class", "col-11 mx-auto");
    			add_location(hr1, file$6, 322, 40, 24219);
    			attr_dev(img11, "class", "personal-img");
    			if (img11.src !== (img11_src_value = "image/4.jpeg")) attr_dev(img11, "src", img11_src_value);
    			attr_dev(img11, "alt", "");
    			add_location(img11, file$6, 325, 48, 24436);
    			attr_dev(span14, "class", "personal-name");
    			add_location(span14, file$6, 326, 48, 24537);
    			attr_dev(a25, "class", "a-clicked");
    			attr_dev(a25, "href", "#");
    			add_location(a25, file$6, 324, 44, 24357);
    			attr_dev(i25, "class", "fas fa-eye");
    			add_location(i25, file$6, 328, 68, 24714);
    			attr_dev(div54, "class", "view-count");
    			add_location(div54, file$6, 328, 44, 24690);
    			attr_dev(div55, "class", "col-12 mb-3");
    			add_location(div55, file$6, 323, 40, 24287);
    			attr_dev(article2, "class", "p-0 shadow-radius-section shadow-section mb-3 bg-light");
    			add_location(article2, file$6, 271, 36, 19398);
    			attr_dev(div56, "class", "col-12 p-0 main-article ");
    			add_location(div56, file$6, 149, 32, 8121);
    			attr_dev(section, "class", "row mx-0 mt-3 mr-0 pt-0  ");
    			add_location(section, file$6, 148, 28, 8045);
    			attr_dev(aside1, "class", "col-12 col-md-9 order-first justify-content-between order-md-0 mx-0 ");
    			add_location(aside1, file$6, 147, 24, 7932);
    			attr_dev(img12, "class", "company-img  w-100");
    			if (img12.src !== (img12_src_value = "image/afarine.jpg")) attr_dev(img12, "src", img12_src_value);
    			attr_dev(img12, "alt", "");
    			add_location(img12, file$6, 339, 36, 25318);
    			attr_dev(div57, "class", "col-10 mx-auto mt-5 mb-3 ");
    			add_location(div57, file$6, 338, 32, 25242);
    			attr_dev(h34, "class", "col-12");
    			add_location(h34, file$6, 341, 32, 25453);
    			attr_dev(h65, "class", "col-12");
    			add_location(h65, file$6, 344, 32, 25586);
    			attr_dev(div58, "class", "row px-0 text-center shadow-radius-section bg-light ");
    			toggle_class(div58, "d-none", /*x*/ ctx[0] <= 767);
    			add_location(div58, file$6, 337, 28, 25121);
    			attr_dev(i26, "class", "fas fa-list-ul category-icon-modal");
    			toggle_class(i26, "category-fixed-icon-modal", /*x*/ ctx[0] <= 767 && /*y*/ ctx[1] >= 400);
    			add_location(i26, file$6, 351, 40, 26206);
    			attr_dev(a26, "type", a26_type_value = /*x*/ ctx[0] <= 767 ? "button" : "");
    			attr_dev(a26, "class", "btn ");
    			attr_dev(a26, "data-toggle", a26_data_toggle_value = /*x*/ ctx[0] <= 767 ? "modal" : "");
    			attr_dev(a26, "data-target", a26_data_target_value = /*x*/ ctx[0] <= 767 ? "#myModal2" : "");
    			add_location(a26, file$6, 350, 36, 26036);
    			attr_dev(span15, "class", "d-none d-md-inline");
    			add_location(span15, file$6, 352, 40, 26348);

    			attr_dev(div59, "class", div59_class_value = /*x*/ ctx[0] >= 767
    			? "col-12 font-weight-bold pb-2 border-bottom pr-0"
    			: "col-12 font-weight-bold");

    			add_location(div59, file$6, 349, 32, 25897);
    			attr_dev(a27, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a27, "data-toggle", "collapse");
    			attr_dev(a27, "data-target", "#collapseOne");
    			attr_dev(a27, "aria-expanded", "true");
    			attr_dev(a27, "aria-controls", "collapseOne");
    			add_location(a27, file$6, 368, 46, 27639);
    			attr_dev(p3, "class", "category-main-text d-inline");
    			add_location(p3, file$6, 370, 48, 27933);
    			attr_dev(a28, "href", "#");
    			attr_dev(a28, "class", "category-main-text-link");
    			add_location(a28, file$6, 369, 46, 27840);
    			attr_dev(h50, "class", "mb-0");
    			add_location(h50, file$6, 367, 44, 27575);
    			attr_dev(div60, "class", "border-bottom pb-2");
    			attr_dev(div60, "id", "headingOne");
    			add_location(div60, file$6, 366, 42, 27482);
    			attr_dev(a29, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a29, "data-toggle", "collapse");
    			attr_dev(a29, "data-target", "#collapseOneOne");
    			attr_dev(a29, "aria-expanded", "true");
    			attr_dev(a29, "aria-controls", "collapseOneOne");
    			add_location(a29, file$6, 381, 62, 28838);
    			attr_dev(p4, "class", "category-main-text d-inline");
    			add_location(p4, file$6, 383, 64, 29170);
    			attr_dev(a30, "href", "#");
    			attr_dev(a30, "class", "category-main-text-link");
    			add_location(a30, file$6, 382, 62, 29061);
    			attr_dev(h51, "class", "mb-0");
    			add_location(h51, file$6, 380, 60, 28758);
    			attr_dev(div61, "class", "border-bottom pb-2");
    			attr_dev(div61, "id", "headingOneOne");
    			add_location(div61, file$6, 379, 58, 28646);
    			attr_dev(div62, "class", "");
    			add_location(div62, file$6, 388, 60, 29646);
    			attr_dev(div63, "id", "collapseOneOne");
    			attr_dev(div63, "class", "collapse mr-3 ");
    			attr_dev(div63, "aria-labelledby", "headingOneOne");
    			attr_dev(div63, "data-parent", "#accordion1");
    			add_location(div63, file$6, 387, 58, 29479);
    			attr_dev(div64, "class", "mb-2 pl-2");
    			add_location(div64, file$6, 378, 56, 28564);
    			attr_dev(a31, "href", "#");
    			attr_dev(a31, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a31, "data-toggle", "collapse");
    			attr_dev(a31, "data-target", "#collapseTwoTwo");
    			attr_dev(a31, "aria-expanded", "false");
    			attr_dev(a31, "aria-controls", "collapseTwoTwo");
    			add_location(a31, file$6, 396, 62, 30256);
    			attr_dev(p5, "class", "category-main-text d-inline");
    			add_location(p5, file$6, 398, 64, 30597);
    			attr_dev(a32, "href", "#");
    			attr_dev(a32, "class", "category-main-text-link");
    			add_location(a32, file$6, 397, 62, 30488);
    			attr_dev(h52, "class", "mb-0");
    			add_location(h52, file$6, 395, 60, 30176);
    			attr_dev(div65, "class", "border-bottom pb-2");
    			attr_dev(div65, "id", "headingTwoTwo");
    			add_location(div65, file$6, 394, 58, 30064);
    			attr_dev(div66, "class", "");
    			add_location(div66, file$6, 403, 60, 31079);
    			attr_dev(div67, "id", "collapseTwoTwo");
    			attr_dev(div67, "class", "collapse mr-3");
    			attr_dev(div67, "aria-labelledby", "headingTwoTwo");
    			attr_dev(div67, "data-parent", "#accordion1");
    			add_location(div67, file$6, 402, 58, 30913);
    			attr_dev(div68, "class", "mb-2 pl-2");
    			add_location(div68, file$6, 393, 56, 29982);
    			attr_dev(a33, "href", "#");
    			attr_dev(a33, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a33, "data-toggle", "collapse");
    			attr_dev(a33, "data-target", "#collapseThreeThree");
    			attr_dev(a33, "aria-expanded", "false");
    			attr_dev(a33, "aria-controls", "collapseThreeThree");
    			add_location(a33, file$6, 411, 62, 31695);
    			attr_dev(p6, "class", "category-main-text d-inline");
    			add_location(p6, file$6, 413, 64, 32044);
    			attr_dev(a34, "href", "#");
    			attr_dev(a34, "class", "category-main-text-link");
    			add_location(a34, file$6, 412, 62, 31935);
    			attr_dev(h53, "class", "mb-0");
    			add_location(h53, file$6, 410, 60, 31615);
    			attr_dev(div69, "class", "border-bottom pb-2");
    			attr_dev(div69, "id", "headingThreeThree");
    			add_location(div69, file$6, 409, 58, 31499);
    			attr_dev(a35, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a35, "data-toggle", "collapse");
    			attr_dev(a35, "data-target", "#collapseOneOneOne");
    			attr_dev(a35, "aria-expanded", "true");
    			attr_dev(a35, "aria-controls", "collapseOneOneOne");
    			add_location(a35, file$6, 424, 78, 33146);
    			attr_dev(p7, "class", "category-main-text d-inline");
    			add_location(p7, file$6, 426, 80, 33516);
    			attr_dev(a36, "href", "#");
    			attr_dev(a36, "class", "category-main-text-link");
    			add_location(a36, file$6, 425, 78, 33391);
    			attr_dev(h54, "class", "mb-0");
    			add_location(h54, file$6, 423, 76, 33050);
    			attr_dev(div70, "class", "border-bottom pb-2");
    			attr_dev(div70, "id", "headingOneOneOne");
    			add_location(div70, file$6, 422, 74, 32919);
    			attr_dev(div71, "class", "");
    			add_location(div71, file$6, 431, 76, 34078);
    			attr_dev(div72, "id", "collapseOneOneOne");
    			attr_dev(div72, "class", "collapse mr-3 ");
    			attr_dev(div72, "aria-labelledby", "headingOneOneOne");
    			attr_dev(div72, "data-parent", "#accordion2");
    			add_location(div72, file$6, 430, 74, 33889);
    			attr_dev(div73, "class", "mb-2 pl-2");
    			add_location(div73, file$6, 421, 72, 32821);
    			attr_dev(p8, "class", "category-main-text d-inline");
    			add_location(p8, file$6, 440, 80, 34944);
    			attr_dev(a37, "href", "#");
    			attr_dev(a37, "class", "category-main-text-link");
    			add_location(a37, file$6, 439, 78, 34819);
    			attr_dev(h55, "class", "mb-0");
    			add_location(h55, file$6, 438, 76, 34723);
    			attr_dev(div74, "class", "border-bottom pb-2");
    			attr_dev(div74, "id", "headingTwoTwoTwo");
    			add_location(div74, file$6, 437, 74, 34592);
    			attr_dev(div75, "class", "");
    			add_location(div75, file$6, 445, 76, 35512);
    			attr_dev(div76, "id", "collapseTwoTwoTwo");
    			attr_dev(div76, "class", "collapse mr-3");
    			attr_dev(div76, "aria-labelledby", "headingTwoTwoTwo");
    			attr_dev(div76, "data-parent", "#accordion2");
    			add_location(div76, file$6, 444, 74, 35324);
    			attr_dev(div77, "class", "mb-2 pl-2");
    			add_location(div77, file$6, 436, 72, 34494);
    			attr_dev(div78, "id", "accordion2");
    			add_location(div78, file$6, 420, 68, 32727);
    			attr_dev(div79, "class", " mt-2 mr-1 col-12 p-0 ");
    			add_location(div79, file$6, 419, 64, 32622);
    			attr_dev(div80, "class", "border-right");
    			add_location(div80, file$6, 418, 60, 32531);
    			attr_dev(div81, "id", "collapseThreeThree");
    			attr_dev(div81, "class", "collapse mr-3");
    			attr_dev(div81, "aria-labelledby", "headingThreeThree");
    			attr_dev(div81, "data-parent", "#accordion1");
    			add_location(div81, file$6, 417, 58, 32357);
    			attr_dev(div82, "class", "mb-2 pl-2");
    			add_location(div82, file$6, 408, 56, 31417);
    			attr_dev(div83, "id", "accordion1");
    			add_location(div83, file$6, 377, 52, 28486);
    			attr_dev(div84, "class", " mt-2 mr-1 col-12 p-0 ");
    			add_location(div84, file$6, 376, 48, 28397);
    			attr_dev(div85, "class", "border-right");
    			add_location(div85, file$6, 375, 44, 28322);
    			attr_dev(div86, "id", "collapseOne");
    			attr_dev(div86, "class", "collapse mr-3 ");
    			attr_dev(div86, "aria-labelledby", "headingOne");
    			attr_dev(div86, "data-parent", "#accordion");
    			add_location(div86, file$6, 374, 42, 28178);
    			attr_dev(div87, "class", "mb-2 pl-2 ");
    			add_location(div87, file$6, 365, 40, 27415);
    			attr_dev(a38, "href", "#");
    			attr_dev(a38, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a38, "data-toggle", "collapse");
    			attr_dev(a38, "data-target", "#collapseTwo");
    			attr_dev(a38, "aria-expanded", "false");
    			attr_dev(a38, "aria-controls", "collapseTwo");
    			add_location(a38, file$6, 463, 46, 36729);
    			attr_dev(p9, "class", "category-main-text d-inline");
    			add_location(p9, file$6, 465, 48, 37032);
    			attr_dev(a39, "href", "#");
    			attr_dev(a39, "class", "category-main-text-link");
    			add_location(a39, file$6, 464, 46, 36939);
    			attr_dev(h56, "class", "mb-0");
    			add_location(h56, file$6, 462, 44, 36665);
    			attr_dev(div88, "class", "border-bottom pb-2");
    			attr_dev(div88, "id", "headingTwo");
    			add_location(div88, file$6, 461, 42, 36572);
    			attr_dev(div89, "class", "");
    			add_location(div89, file$6, 470, 44, 37427);
    			attr_dev(div90, "id", "collapseTwo");
    			attr_dev(div90, "class", "collapse mr-3");
    			attr_dev(div90, "aria-labelledby", "headingTwo");
    			attr_dev(div90, "data-parent", "#accordion");
    			add_location(div90, file$6, 469, 42, 37284);
    			attr_dev(div91, "class", "mb-2 pl-2");
    			add_location(div91, file$6, 460, 40, 36506);
    			attr_dev(a40, "href", "#");
    			attr_dev(a40, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a40, "data-toggle", "collapse");
    			attr_dev(a40, "data-target", "#collapseThree");
    			attr_dev(a40, "aria-expanded", "false");
    			attr_dev(a40, "aria-controls", "collapseThree");
    			add_location(a40, file$6, 478, 46, 37910);
    			attr_dev(p10, "class", "category-main-text d-inline");
    			add_location(p10, file$6, 480, 48, 38217);
    			attr_dev(a41, "href", "#");
    			attr_dev(a41, "class", "category-main-text-link");
    			add_location(a41, file$6, 479, 46, 38124);
    			attr_dev(h57, "class", "mb-0");
    			add_location(h57, file$6, 477, 44, 37846);
    			attr_dev(div92, "class", "border-bottom pb-2");
    			attr_dev(div92, "id", "headingThree");
    			add_location(div92, file$6, 476, 42, 37751);
    			attr_dev(div93, "class", "");
    			add_location(div93, file$6, 485, 44, 38613);
    			attr_dev(div94, "id", "collapseThree");
    			attr_dev(div94, "class", "collapse mr-3");
    			attr_dev(div94, "aria-labelledby", "headingThree");
    			attr_dev(div94, "data-parent", "#accordion");
    			add_location(div94, file$6, 484, 42, 38466);
    			attr_dev(div95, "class", "mb-2 pl-2");
    			add_location(div95, file$6, 475, 40, 37685);
    			attr_dev(div96, "id", "accordion");

    			attr_dev(div96, "class", div96_class_value = /*x*/ ctx[0] <= 767
    			? "modal-dialog modal-content pr-2"
    			: "");

    			attr_dev(div96, "role", div96_role_value = /*x*/ ctx[0] <= 767 ? "document" : "");
    			add_location(div96, file$6, 355, 36, 26698);
    			attr_dev(div97, "class", div97_class_value = "" + ((/*x*/ ctx[0] <= 767 ? "modal right" : "") + " mt-2 mr-1 col-12 p-0 d-lg-inline"));
    			attr_dev(div97, "id", div97_id_value = /*x*/ ctx[0] <= 767 ? "myModal2" : "");
    			attr_dev(div97, "tabindex", div97_tabindex_value = /*x*/ ctx[0] <= 767 ? "-1" : "");
    			attr_dev(div97, "role", div97_role_value = /*x*/ ctx[0] <= 767 ? "dialog" : "");
    			attr_dev(div97, "aria-hidden", "true");
    			add_location(div97, file$6, 354, 32, 26470);

    			attr_dev(div98, "class", div98_class_value = /*x*/ ctx[0] >= 767
    			? "row direction shadow-radius-section mt-4 py-2 bg-white"
    			: "row direction ");

    			add_location(div98, file$6, 348, 28, 25763);
    			attr_dev(aside2, "class", " col-12 col-md-3 mt-3 ");
    			add_location(aside2, file$6, 336, 24, 25053);
    			attr_dev(div99, "class", "row px-0 mx-0");
    			add_location(div99, file$6, 146, 20, 7879);
    			attr_dev(div100, "id", "post");
    			attr_dev(div100, "class", "row tab-pane");
    			toggle_class(div100, "active", /*current*/ ctx[3] === "post");
    			add_location(div100, file$6, 145, 16, 7788);
    			attr_dev(h58, "class", "text-bold mb-2");
    			add_location(h58, file$6, 500, 32, 39369);
    			attr_dev(p11, "class", "text-secondary text-justify word-space");
    			add_location(p11, file$6, 501, 32, 39447);
    			attr_dev(div101, "class", "col-4 text-bold pr-0");
    			add_location(div101, file$6, 508, 40, 40174);
    			attr_dev(a42, "class", "text-primary");
    			attr_dev(a42, "href", "#");
    			add_location(a42, file$6, 510, 44, 40345);
    			attr_dev(div102, "class", "col-8 text-bold pr-0 mb-4");
    			add_location(div102, file$6, 509, 40, 40261);
    			attr_dev(div103, "class", "col-4 text-bold pr-0");
    			add_location(div103, file$6, 514, 40, 40583);
    			attr_dev(div104, "class", "col-8 pr-0 mb-4 text-secondary");
    			add_location(div104, file$6, 515, 40, 40674);
    			attr_dev(div105, "class", "col-4 text-bold pr-0");
    			add_location(div105, file$6, 518, 40, 40880);
    			attr_dev(div106, "class", "col-8 pr-0 mb-4 text-secondary");
    			add_location(div106, file$6, 519, 40, 40974);
    			attr_dev(div107, "class", "col-4 text-bold pr-0");
    			add_location(div107, file$6, 522, 40, 41163);
    			attr_dev(div108, "class", "col-8 pr-0 mb-4 text-secondary");
    			add_location(div108, file$6, 523, 40, 41255);
    			attr_dev(div109, "class", "col-4 text-bold pr-0");
    			add_location(div109, file$6, 526, 40, 41436);
    			attr_dev(div110, "class", "col-8 pr-0 mb-4 text-secondary");
    			add_location(div110, file$6, 527, 40, 41524);
    			attr_dev(div111, "class", "col-4 text-bold pr-0");
    			add_location(div111, file$6, 530, 40, 41727);
    			attr_dev(div112, "class", "col-8 pr-0 mb-4 text-secondary");
    			add_location(div112, file$6, 531, 40, 41817);
    			attr_dev(div113, "class", "row ");
    			add_location(div113, file$6, 507, 36, 40115);
    			attr_dev(div114, "class", "col-12");
    			add_location(div114, file$6, 506, 32, 40058);
    			attr_dev(div115, "class", "col-12 ");
    			add_location(div115, file$6, 499, 28, 39315);
    			attr_dev(div116, "class", "row bg-white shadow-radius-section ml-1 py-4 px-1");
    			add_location(div116, file$6, 498, 24, 39223);
    			attr_dev(h59, "class", "text-bold ");
    			add_location(h59, file$6, 540, 32, 42308);
    			attr_dev(p12, "class", "text-secondary text-justify word-space");
    			add_location(p12, file$6, 541, 32, 42388);
    			attr_dev(div117, "class", "row");
    			add_location(div117, file$6, 544, 32, 42579);
    			attr_dev(div118, "class", "col-12 ");
    			add_location(div118, file$6, 539, 28, 42254);
    			attr_dev(div119, "class", "row bg-white shadow-radius-section ml-1 py-4 px-1 mt-3");
    			add_location(div119, file$6, 538, 24, 42157);
    			attr_dev(div120, "class", "col-12 direction ");
    			add_location(div120, file$6, 497, 20, 39167);
    			attr_dev(div121, "id", "about");
    			attr_dev(div121, "class", "row tab-pane mt-3 margin-about-right");
    			toggle_class(div121, "active", /*current*/ ctx[3] === "about");
    			add_location(div121, file$6, 496, 16, 39050);
    			attr_dev(div122, "class", "tab-content w-100 mr-0");
    			add_location(div122, file$6, 144, 12, 7735);
    			attr_dev(aside3, "class", "col-12 col-lg-8  ");
    			add_location(aside3, file$6, 99, 8, 4207);
    			attr_dev(div123, "class", "row justify-content-center mx-0");
    			add_location(div123, file$6, 84, 4, 3606);
    			attr_dev(main, "class", "container-fluid pin-parent px-0 px-md-3");
    			add_location(main, file$6, 83, 0, 3530);
    			add_location(br0, file$6, 557, 0, 42862);
    			add_location(br1, file$6, 557, 4, 42866);
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, div123);
    			append_dev(div123, aside0);
    			append_dev(aside0, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, a0);
    			append_dev(a0, img0);
    			append_dev(div123, t1);
    			append_dev(div123, aside3);
    			append_dev(aside3, div16);
    			append_dev(div16, div15);
    			append_dev(div15, div14);
    			append_dev(div14, div4);
    			append_dev(div4, img1);
    			append_dev(div14, t2);
    			append_dev(div14, div5);
    			append_dev(div5, img2);
    			append_dev(div14, t3);
    			append_dev(div14, div11);
    			append_dev(div11, div10);
    			append_dev(div10, div9);
    			append_dev(div9, h30);
    			append_dev(h30, t4);
    			append_dev(h30, i0);
    			append_dev(div9, t5);
    			append_dev(div9, h60);
    			append_dev(h60, i1);
    			append_dev(h60, t6);
    			append_dev(div9, t7);
    			append_dev(div9, h61);
    			append_dev(div9, t9);
    			append_dev(div9, div8);
    			append_dev(div8, div7);
    			append_dev(div7, button0);
    			append_dev(button0, i2);
    			append_dev(button0, t10);
    			append_dev(div7, t11);
    			append_dev(div7, div6);
    			append_dev(div6, button1);
    			append_dev(div6, t13);
    			append_dev(div6, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a1);
    			append_dev(a1, i3);
    			append_dev(a1, t14);
    			append_dev(ul0, t15);
    			append_dev(ul0, li1);
    			append_dev(li1, a2);
    			append_dev(a2, i4);
    			append_dev(a2, t16);
    			append_dev(div14, t17);
    			append_dev(div14, div13);
    			append_dev(div13, div12);
    			append_dev(div12, ul1);
    			append_dev(ul1, li2);
    			append_dev(li2, a3);
    			append_dev(ul1, t19);
    			append_dev(ul1, li3);
    			append_dev(li3, a4);
    			append_dev(aside3, t21);
    			append_dev(aside3, div122);
    			append_dev(div122, div100);
    			append_dev(div100, div99);
    			append_dev(div99, aside1);
    			append_dev(aside1, section);
    			append_dev(section, div56);
    			append_dev(div56, article0);
    			append_dev(article0, div24);
    			append_dev(div24, div23);
    			append_dev(div23, div21);
    			append_dev(div21, div20);
    			append_dev(div20, div17);
    			append_dev(div17, img3);
    			append_dev(div20, t22);
    			append_dev(div20, div19);
    			append_dev(div19, div18);
    			append_dev(div18, h62);
    			append_dev(h62, a5);
    			append_dev(a5, t23);
    			append_dev(a5, i5);
    			append_dev(div18, t24);
    			append_dev(div18, span0);
    			append_dev(span0, i6);
    			append_dev(span0, t25);
    			append_dev(div23, t26);
    			append_dev(div23, div22);
    			append_dev(div22, i7);
    			append_dev(div22, t27);
    			append_dev(div22, ul2);
    			append_dev(ul2, li4);
    			append_dev(li4, a6);
    			append_dev(a6, i8);
    			append_dev(a6, t28);
    			append_dev(ul2, t29);
    			append_dev(ul2, li5);
    			append_dev(li5, a7);
    			append_dev(a7, i9);
    			append_dev(a7, t30);
    			append_dev(ul2, t31);
    			append_dev(ul2, li6);
    			append_dev(li6, a8);
    			append_dev(a8, i10);
    			append_dev(a8, t32);
    			append_dev(article0, t33);
    			append_dev(article0, div25);
    			append_dev(div25, h31);
    			append_dev(h31, a9);
    			append_dev(article0, t35);
    			append_dev(article0, div26);
    			append_dev(div26, img4);
    			append_dev(article0, t36);
    			append_dev(article0, p0);
    			append_dev(p0, t37);
    			append_dev(p0, span1);
    			append_dev(p0, span2);
    			append_dev(p0, t40);
    			append_dev(p0, span3);
    			append_dev(article0, t42);
    			append_dev(article0, div27);
    			append_dev(div27, a10);
    			append_dev(a10, button2);
    			append_dev(article0, t44);
    			append_dev(article0, div29);
    			append_dev(div29, a11);
    			append_dev(a11, img5);
    			append_dev(a11, t45);
    			append_dev(a11, span4);
    			append_dev(a11, t47);
    			append_dev(div29, t48);
    			append_dev(div29, div28);
    			append_dev(div28, i11);
    			append_dev(div28, t49);
    			append_dev(div56, t50);
    			append_dev(div56, article1);
    			append_dev(article1, div37);
    			append_dev(div37, div36);
    			append_dev(div36, div34);
    			append_dev(div34, div33);
    			append_dev(div33, div30);
    			append_dev(div30, img6);
    			append_dev(div33, t51);
    			append_dev(div33, div32);
    			append_dev(div32, div31);
    			append_dev(div31, h63);
    			append_dev(h63, a12);
    			append_dev(a12, t52);
    			append_dev(a12, i12);
    			append_dev(div31, t53);
    			append_dev(div31, span5);
    			append_dev(span5, i13);
    			append_dev(span5, t54);
    			append_dev(div36, t55);
    			append_dev(div36, div35);
    			append_dev(div35, i14);
    			append_dev(div35, t56);
    			append_dev(div35, ul3);
    			append_dev(ul3, li7);
    			append_dev(li7, a13);
    			append_dev(a13, i15);
    			append_dev(a13, t57);
    			append_dev(ul3, t58);
    			append_dev(ul3, li8);
    			append_dev(li8, a14);
    			append_dev(a14, i16);
    			append_dev(a14, t59);
    			append_dev(ul3, t60);
    			append_dev(ul3, li9);
    			append_dev(li9, a15);
    			append_dev(a15, i17);
    			append_dev(a15, t61);
    			append_dev(article1, t62);
    			append_dev(article1, div38);
    			append_dev(div38, h32);
    			append_dev(h32, a16);
    			append_dev(article1, t64);
    			append_dev(article1, div39);
    			append_dev(div39, img7);
    			append_dev(article1, t65);
    			append_dev(article1, p1);
    			append_dev(p1, t66);
    			append_dev(p1, span6);
    			append_dev(p1, span7);
    			append_dev(p1, t69);
    			append_dev(p1, span8);
    			append_dev(article1, t71);
    			append_dev(article1, div40);
    			append_dev(div40, a17);
    			append_dev(a17, button3);
    			append_dev(article1, t73);
    			append_dev(article1, hr0);
    			append_dev(article1, t74);
    			append_dev(article1, div42);
    			append_dev(div42, a18);
    			append_dev(a18, img8);
    			append_dev(a18, t75);
    			append_dev(a18, span9);
    			append_dev(a18, t77);
    			append_dev(div42, t78);
    			append_dev(div42, div41);
    			append_dev(div41, i18);
    			append_dev(div41, t79);
    			append_dev(div56, t80);
    			append_dev(div56, article2);
    			append_dev(article2, div50);
    			append_dev(div50, div49);
    			append_dev(div49, div47);
    			append_dev(div47, div46);
    			append_dev(div46, div43);
    			append_dev(div43, img9);
    			append_dev(div46, t81);
    			append_dev(div46, div45);
    			append_dev(div45, div44);
    			append_dev(div44, h64);
    			append_dev(h64, a19);
    			append_dev(a19, t82);
    			append_dev(a19, i19);
    			append_dev(div44, t83);
    			append_dev(div44, span10);
    			append_dev(span10, i20);
    			append_dev(span10, t84);
    			append_dev(div49, t85);
    			append_dev(div49, div48);
    			append_dev(div48, i21);
    			append_dev(div48, t86);
    			append_dev(div48, ul4);
    			append_dev(ul4, li10);
    			append_dev(li10, a20);
    			append_dev(a20, i22);
    			append_dev(a20, t87);
    			append_dev(ul4, t88);
    			append_dev(ul4, li11);
    			append_dev(li11, a21);
    			append_dev(a21, i23);
    			append_dev(a21, t89);
    			append_dev(ul4, t90);
    			append_dev(ul4, li12);
    			append_dev(li12, a22);
    			append_dev(a22, i24);
    			append_dev(a22, t91);
    			append_dev(article2, t92);
    			append_dev(article2, div51);
    			append_dev(div51, h33);
    			append_dev(h33, a23);
    			append_dev(article2, t94);
    			append_dev(article2, div52);
    			append_dev(div52, img10);
    			append_dev(article2, t95);
    			append_dev(article2, p2);
    			append_dev(p2, t96);
    			append_dev(p2, span11);
    			append_dev(p2, span12);
    			append_dev(p2, t99);
    			append_dev(p2, span13);
    			append_dev(article2, t101);
    			append_dev(article2, div53);
    			append_dev(div53, a24);
    			append_dev(a24, button4);
    			append_dev(article2, t103);
    			append_dev(article2, hr1);
    			append_dev(article2, t104);
    			append_dev(article2, div55);
    			append_dev(div55, a25);
    			append_dev(a25, img11);
    			append_dev(a25, t105);
    			append_dev(a25, span14);
    			append_dev(a25, t107);
    			append_dev(div55, t108);
    			append_dev(div55, div54);
    			append_dev(div54, i25);
    			append_dev(div54, t109);
    			append_dev(div99, t110);
    			append_dev(div99, aside2);
    			append_dev(aside2, div58);
    			append_dev(div58, div57);
    			append_dev(div57, img12);
    			append_dev(div58, t111);
    			append_dev(div58, h34);
    			append_dev(div58, t113);
    			append_dev(div58, h65);
    			append_dev(aside2, t115);
    			append_dev(aside2, div98);
    			append_dev(div98, div59);
    			append_dev(div59, a26);
    			append_dev(a26, i26);
    			append_dev(a26, t116);
    			append_dev(div59, span15);
    			append_dev(div98, t118);
    			append_dev(div98, div97);
    			append_dev(div97, div96);
    			if (if_block1) if_block1.m(div96, null);
    			append_dev(div96, t119);
    			append_dev(div96, div87);
    			append_dev(div87, div60);
    			append_dev(div60, h50);
    			append_dev(h50, a27);
    			append_dev(h50, t120);
    			append_dev(h50, a28);
    			append_dev(a28, p3);
    			append_dev(div87, t122);
    			append_dev(div87, div86);
    			append_dev(div86, div85);
    			append_dev(div85, div84);
    			append_dev(div84, div83);
    			append_dev(div83, div64);
    			append_dev(div64, div61);
    			append_dev(div61, h51);
    			append_dev(h51, a29);
    			append_dev(h51, t123);
    			append_dev(h51, a30);
    			append_dev(a30, p4);
    			append_dev(div64, t125);
    			append_dev(div64, div63);
    			append_dev(div63, div62);
    			append_dev(div83, t127);
    			append_dev(div83, div68);
    			append_dev(div68, div65);
    			append_dev(div65, h52);
    			append_dev(h52, a31);
    			append_dev(h52, t128);
    			append_dev(h52, a32);
    			append_dev(a32, p5);
    			append_dev(div68, t130);
    			append_dev(div68, div67);
    			append_dev(div67, div66);
    			append_dev(div83, t132);
    			append_dev(div83, div82);
    			append_dev(div82, div69);
    			append_dev(div69, h53);
    			append_dev(h53, a33);
    			append_dev(h53, t133);
    			append_dev(h53, a34);
    			append_dev(a34, p6);
    			append_dev(div82, t135);
    			append_dev(div82, div81);
    			append_dev(div81, div80);
    			append_dev(div80, div79);
    			append_dev(div79, div78);
    			append_dev(div78, div73);
    			append_dev(div73, div70);
    			append_dev(div70, h54);
    			append_dev(h54, a35);
    			append_dev(h54, t136);
    			append_dev(h54, a36);
    			append_dev(a36, p7);
    			append_dev(div73, t138);
    			append_dev(div73, div72);
    			append_dev(div72, div71);
    			append_dev(div78, t140);
    			append_dev(div78, div77);
    			append_dev(div77, div74);
    			append_dev(div74, h55);
    			append_dev(h55, a37);
    			append_dev(a37, p8);
    			append_dev(div77, t142);
    			append_dev(div77, div76);
    			append_dev(div76, div75);
    			append_dev(div96, t144);
    			append_dev(div96, div91);
    			append_dev(div91, div88);
    			append_dev(div88, h56);
    			append_dev(h56, a38);
    			append_dev(h56, t145);
    			append_dev(h56, a39);
    			append_dev(a39, p9);
    			append_dev(div91, t147);
    			append_dev(div91, div90);
    			append_dev(div90, div89);
    			append_dev(div96, t149);
    			append_dev(div96, div95);
    			append_dev(div95, div92);
    			append_dev(div92, h57);
    			append_dev(h57, a40);
    			append_dev(h57, t150);
    			append_dev(h57, a41);
    			append_dev(a41, p10);
    			append_dev(div95, t152);
    			append_dev(div95, div94);
    			append_dev(div94, div93);
    			append_dev(div122, t154);
    			append_dev(div122, div121);
    			append_dev(div121, div120);
    			append_dev(div120, div116);
    			append_dev(div116, div115);
    			append_dev(div115, h58);
    			append_dev(div115, t156);
    			append_dev(div115, p11);
    			append_dev(div115, t158);
    			append_dev(div115, div114);
    			append_dev(div114, div113);
    			append_dev(div113, div101);
    			append_dev(div113, t160);
    			append_dev(div113, div102);
    			append_dev(div102, a42);
    			append_dev(div113, t162);
    			append_dev(div113, div103);
    			append_dev(div113, t164);
    			append_dev(div113, div104);
    			append_dev(div113, t166);
    			append_dev(div113, div105);
    			append_dev(div113, t168);
    			append_dev(div113, div106);
    			append_dev(div113, t170);
    			append_dev(div113, div107);
    			append_dev(div113, t172);
    			append_dev(div113, div108);
    			append_dev(div113, t174);
    			append_dev(div113, div109);
    			append_dev(div113, t176);
    			append_dev(div113, div110);
    			append_dev(div113, t178);
    			append_dev(div113, div111);
    			append_dev(div113, t180);
    			append_dev(div113, div112);
    			append_dev(div120, t182);
    			append_dev(div120, div119);
    			append_dev(div119, div118);
    			append_dev(div118, h59);
    			append_dev(div118, t184);
    			append_dev(div118, p12);
    			append_dev(div118, t186);
    			append_dev(div118, div117);
    			insert_dev(target, t187, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, br1, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(a3, "click", /*click_handler_2*/ ctx[8], false, false, false),
    					listen_dev(a4, "click", /*click_handler_3*/ ctx[9], false, false, false),
    					listen_dev(span3, "click", myFunction, false, false, false),
    					listen_dev(span8, "click", myFunction, false, false, false),
    					listen_dev(span13, "click", myFunction, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*y*/ ctx[1] > 600) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*y*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a3, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a4, "active", /*current*/ ctx[3] === "about");
    			}

    			if (dirty & /*x*/ 1) {
    				toggle_class(div58, "d-none", /*x*/ ctx[0] <= 767);
    			}

    			if (dirty & /*x, y*/ 3) {
    				toggle_class(i26, "category-fixed-icon-modal", /*x*/ ctx[0] <= 767 && /*y*/ ctx[1] >= 400);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_type_value !== (a26_type_value = /*x*/ ctx[0] <= 767 ? "button" : "")) {
    				attr_dev(a26, "type", a26_type_value);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_data_toggle_value !== (a26_data_toggle_value = /*x*/ ctx[0] <= 767 ? "modal" : "")) {
    				attr_dev(a26, "data-toggle", a26_data_toggle_value);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_data_target_value !== (a26_data_target_value = /*x*/ ctx[0] <= 767 ? "#myModal2" : "")) {
    				attr_dev(a26, "data-target", a26_data_target_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div59_class_value !== (div59_class_value = /*x*/ ctx[0] >= 767
    			? "col-12 font-weight-bold pb-2 border-bottom pr-0"
    			: "col-12 font-weight-bold")) {
    				attr_dev(div59, "class", div59_class_value);
    			}

    			if (/*x*/ ctx[0] <= 767) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block$2(ctx);
    					if_block1.c();
    					if_block1.m(div96, t119);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!current || dirty & /*x*/ 1 && div96_class_value !== (div96_class_value = /*x*/ ctx[0] <= 767
    			? "modal-dialog modal-content pr-2"
    			: "")) {
    				attr_dev(div96, "class", div96_class_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div96_role_value !== (div96_role_value = /*x*/ ctx[0] <= 767 ? "document" : "")) {
    				attr_dev(div96, "role", div96_role_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_class_value !== (div97_class_value = "" + ((/*x*/ ctx[0] <= 767 ? "modal right" : "") + " mt-2 mr-1 col-12 p-0 d-lg-inline"))) {
    				attr_dev(div97, "class", div97_class_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_id_value !== (div97_id_value = /*x*/ ctx[0] <= 767 ? "myModal2" : "")) {
    				attr_dev(div97, "id", div97_id_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_tabindex_value !== (div97_tabindex_value = /*x*/ ctx[0] <= 767 ? "-1" : "")) {
    				attr_dev(div97, "tabindex", div97_tabindex_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_role_value !== (div97_role_value = /*x*/ ctx[0] <= 767 ? "dialog" : "")) {
    				attr_dev(div97, "role", div97_role_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div98_class_value !== (div98_class_value = /*x*/ ctx[0] >= 767
    			? "row direction shadow-radius-section mt-4 py-2 bg-white"
    			: "row direction ")) {
    				attr_dev(div98, "class", div98_class_value);
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(div100, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(div121, "active", /*current*/ ctx[3] === "about");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);

    			add_render_callback(() => {
    				if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, true);
    				main_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, false);
    			main_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (if_block1) if_block1.d();
    			if (detaching && main_transition) main_transition.end();
    			if (detaching) detach_dev(t187);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(br1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(37:0) <Router url=\\\"{url}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let t;
    	let router;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[4]);
    	add_render_callback(/*onwindowresize*/ ctx[5]);

    	router = new Router({
    			props: {
    				url: /*url*/ ctx[2],
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			t = space();
    			create_component(router.$$.fragment);
    			document.title = "\n        اینولینکس\n    ";
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    			mount_component(router, target, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1$2, "scroll", () => {
    						scrolling = true;
    						clearTimeout(scrolling_timeout);
    						scrolling_timeout = setTimeout(clear_scrolling, 100);
    						/*onwindowscroll*/ ctx[4]();
    					}),
    					listen_dev(window_1$2, "resize", /*onwindowresize*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 2 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$2.pageXOffset, /*y*/ ctx[1]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			const router_changes = {};
    			if (dirty & /*url*/ 4) router_changes.url = /*url*/ ctx[2];

    			if (dirty & /*$$scope, current, x, y*/ 262155) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    			destroy_component(router, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Profile", slots, []);
    	let { url = "" } = $$props;
    	let { y } = $$props;
    	let { x } = $$props;
    	const urlParams = new URLSearchParams(window.location.search);
    	const id = urlParams.has("id");
    	console.log(id);
    	let isOpen = false;
    	let current = "post";

    	function toggleNav() {
    		isOpen = !isOpen;
    	}

    	//let y=0;
    	var currentLocation = window.location.href;

    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];

    	// $ : console.log(lastSugment);
    	let map;

    	const writable_props = ["url", "y", "x"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$2.warn(`<Profile> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(1, y = window_1$2.pageYOffset);
    	}

    	function onwindowresize() {
    		$$invalidate(0, x = window_1$2.innerWidth);
    	}

    	const click_handler = () => $$invalidate(3, current = "post");
    	const click_handler_1 = () => $$invalidate(3, current = "about");
    	const click_handler_2 = () => $$invalidate(3, current = "post");
    	const click_handler_3 = () => $$invalidate(3, current = "about");

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(2, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		fade,
    		slide,
    		scale,
    		fly,
    		Loader,
    		Router,
    		Link,
    		Route,
    		circIn,
    		showDetail: Show_detail,
    		url,
    		y,
    		x,
    		urlParams,
    		id,
    		isOpen,
    		current,
    		toggleNav,
    		currentLocation,
    		splitUrl,
    		lastSugment,
    		map
    	});

    	$$self.$inject_state = $$props => {
    		if ("url" in $$props) $$invalidate(2, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    		if ("isOpen" in $$props) isOpen = $$props.isOpen;
    		if ("current" in $$props) $$invalidate(3, current = $$props.current);
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) lastSugment = $$props.lastSugment;
    		if ("map" in $$props) map = $$props.map;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*x*/ 1) {
    			console.log(x);
    		}
    	};

    	return [
    		x,
    		y,
    		url,
    		current,
    		onwindowscroll,
    		onwindowresize,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class Profile extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { url: 2, y: 1, x: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Profile",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[1] === undefined && !("y" in props)) {
    			console_1$2.warn("<Profile> was created without expected prop 'y'");
    		}

    		if (/*x*/ ctx[0] === undefined && !("x" in props)) {
    			console_1$2.warn("<Profile> was created without expected prop 'x'");
    		}
    	}

    	get url() {
    		throw new Error("<Profile>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Profile>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Profile>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Profile>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get x() {
    		throw new Error("<Profile>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<Profile>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/pages/magezine.svelte generated by Svelte v3.38.3 */

    const { console: console_1$1, window: window_1$1 } = globals;
    const file$5 = "src/pages/magezine.svelte";

    // (40:0) {#if y>600}
    function create_if_block_1$1(ctx) {
    	let section;
    	let div10;
    	let div7;
    	let div2;
    	let div1;
    	let button0;
    	let i0;
    	let t0;
    	let t1;
    	let div0;
    	let button1;
    	let t3;
    	let ul0;
    	let li0;
    	let a0;
    	let i1;
    	let t4;
    	let t5;
    	let li1;
    	let a1;
    	let i2;
    	let t6;
    	let t7;
    	let div6;
    	let div5;
    	let div3;
    	let img;
    	let img_src_value;
    	let t8;
    	let div4;
    	let h5;
    	let t9;
    	let i3;
    	let t10;
    	let div9;
    	let div8;
    	let ul1;
    	let li2;
    	let a2;
    	let t12;
    	let li3;
    	let a3;
    	let div10_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div10 = element("div");
    			div7 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			button0 = element("button");
    			i0 = element("i");
    			t0 = text("بازدید سایت");
    			t1 = space();
    			div0 = element("div");
    			button1 = element("button");
    			button1.textContent = "بیشتر";
    			t3 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			i1 = element("i");
    			t4 = text(" اشتراک صفحه");
    			t5 = space();
    			li1 = element("li");
    			a1 = element("a");
    			i2 = element("i");
    			t6 = text(" گزارش دادن");
    			t7 = space();
    			div6 = element("div");
    			div5 = element("div");
    			div3 = element("div");
    			img = element("img");
    			t8 = space();
    			div4 = element("div");
    			h5 = element("h5");
    			t9 = text("آفرینه ");
    			i3 = element("i");
    			t10 = space();
    			div9 = element("div");
    			div8 = element("div");
    			ul1 = element("ul");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "پست";
    			t12 = space();
    			li3 = element("li");
    			a3 = element("a");
    			a3.textContent = "درباره";
    			attr_dev(i0, "class", "fas fa-external-link-alt padding-button ml-2 icon-size-scroll");
    			add_location(i0, file$5, 46, 100, 1576);
    			attr_dev(button0, "class", "btn rounded-pill font btn-mw-scroll text-center visit-btn mx-0 ");
    			add_location(button0, file$5, 46, 20, 1496);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "data-toggle", "dropdown");
    			attr_dev(button1, "class", "pt-0 pl-md-5 pr-md-3 px-lg-3 btn btn-sm btn-mw-scroll rounded-pill col-12 font text-center col-md-7");
    			add_location(button1, file$5, 49, 24, 1790);
    			attr_dev(i1, "class", "fas fa-share-alt");
    			add_location(i1, file$5, 52, 44, 2094);
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$5, 52, 32, 2082);
    			add_location(li0, file$5, 52, 28, 2078);
    			attr_dev(i2, "class", "fas fa-flag");
    			add_location(i2, file$5, 53, 44, 2193);
    			attr_dev(a1, "href", "#");
    			add_location(a1, file$5, 53, 32, 2181);
    			add_location(li1, file$5, 53, 28, 2177);
    			attr_dev(ul0, "class", "dropdown-menu  ellipsis-menu");
    			add_location(ul0, file$5, 51, 24, 2008);
    			attr_dev(div0, "class", "col-5 mr-0 justify-content-start dropdown dropleft px-2");
    			add_location(div0, file$5, 48, 20, 1696);
    			attr_dev(div1, "class", "row justify-content-end");
    			add_location(div1, file$5, 45, 16, 1438);
    			attr_dev(div2, "class", "col-8 col-md-4 direction my-auto");
    			add_location(div2, file$5, 44, 12, 1374);
    			if (img.src !== (img_src_value = "image/afarine.jpg")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "class", "logo-cu-scroll");
    			attr_dev(img, "alt", "");
    			add_location(img, file$5, 61, 24, 2527);
    			attr_dev(div3, "class", "col-1 mr-3  my-auto");
    			add_location(div3, file$5, 60, 20, 2469);
    			set_style(i3, "color", "#048af7");
    			set_style(i3, "font-size", "13px");
    			attr_dev(i3, "class", "fas fa-check-circle");
    			add_location(i3, file$5, 64, 75, 2730);
    			attr_dev(h5, "class", "text-logo-scroll mt-2 mr-2");
    			add_location(h5, file$5, 64, 24, 2679);
    			attr_dev(div4, "class", "col-10");
    			add_location(div4, file$5, 63, 20, 2634);
    			attr_dev(div5, "class", "row mr-3 ");
    			add_location(div5, file$5, 59, 16, 2425);
    			attr_dev(div6, "class", "col-6  col-md-5 bg-light py-2  direction ");
    			add_location(div6, file$5, 58, 12, 2352);
    			attr_dev(div7, "class", "row justify-content-between shadow-sm mr-0");
    			add_location(div7, file$5, 43, 8, 1305);
    			attr_dev(a2, "class", "py-2 nav-link-scroll");
    			attr_dev(a2, "data-toggle", "tab");
    			attr_dev(a2, "href", "#post");
    			toggle_class(a2, "active", /*current*/ ctx[3] === "post");
    			add_location(a2, file$5, 72, 53, 3134);
    			attr_dev(li2, "class", "nav-item-scroll mt-2");
    			add_location(li2, file$5, 72, 20, 3101);
    			attr_dev(a3, "class", "py-2 nav-link-scroll");
    			attr_dev(a3, "data-toggle", "tab");
    			attr_dev(a3, "href", "#about");
    			toggle_class(a3, "active", /*current*/ ctx[3] === "about");
    			add_location(a3, file$5, 73, 53, 3331);
    			attr_dev(li3, "class", "nav-item-scroll mt-2");
    			add_location(li3, file$5, 73, 20, 3298);
    			attr_dev(ul1, "class", "nav nav-tabs direction text-center");
    			attr_dev(ul1, "role", "tablist");
    			add_location(ul1, file$5, 71, 16, 3018);
    			attr_dev(div8, "class", "row  mx-4 scroll-main-height");
    			add_location(div8, file$5, 70, 12, 2959);
    			attr_dev(div9, "class", "col-12 mt-0 scroll-main-height");
    			add_location(div9, file$5, 69, 8, 2902);
    			attr_dev(div10, "class", "col-12 scroll-div bg-light pr-0 mr-5 nav-custome-top");
    			add_location(div10, file$5, 42, 4, 1213);
    			attr_dev(section, "class", "row nav-mag-scroll pr-0 mr-0 bg-light mt-0 d-none d-md-inline");
    			add_location(section, file$5, 40, 0, 1122);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div10);
    			append_dev(div10, div7);
    			append_dev(div7, div2);
    			append_dev(div2, div1);
    			append_dev(div1, button0);
    			append_dev(button0, i0);
    			append_dev(button0, t0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, button1);
    			append_dev(div0, t3);
    			append_dev(div0, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a0);
    			append_dev(a0, i1);
    			append_dev(a0, t4);
    			append_dev(ul0, t5);
    			append_dev(ul0, li1);
    			append_dev(li1, a1);
    			append_dev(a1, i2);
    			append_dev(a1, t6);
    			append_dev(div7, t7);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, div3);
    			append_dev(div3, img);
    			append_dev(div5, t8);
    			append_dev(div5, div4);
    			append_dev(div4, h5);
    			append_dev(h5, t9);
    			append_dev(h5, i3);
    			append_dev(div10, t10);
    			append_dev(div10, div9);
    			append_dev(div9, div8);
    			append_dev(div8, ul1);
    			append_dev(ul1, li2);
    			append_dev(li2, a2);
    			append_dev(ul1, t12);
    			append_dev(ul1, li3);
    			append_dev(li3, a3);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(a2, "click", /*click_handler*/ ctx[6], false, false, false),
    					listen_dev(a3, "click", /*click_handler_1*/ ctx[7], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*current*/ 8) {
    				toggle_class(a2, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a3, "active", /*current*/ ctx[3] === "about");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div10_transition) div10_transition = create_bidirectional_transition(div10, slide, {}, true);
    				div10_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div10_transition) div10_transition = create_bidirectional_transition(div10, slide, {}, false);
    			div10_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			if (detaching && div10_transition) div10_transition.end();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(40:0) {#if y>600}",
    		ctx
    	});

    	return block;
    }

    // (359:40) {#if x<=767}
    function create_if_block$1(ctx) {
    	let button;
    	let span;

    	const block = {
    		c: function create() {
    			button = element("button");
    			span = element("span");
    			span.textContent = "×";
    			attr_dev(span, "class", "col-1 mt-1");
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file$5, 363, 48, 27924);
    			attr_dev(button, "type", "button");
    			attr_dev(button, "class", "close row mx-2 justify-content-end");
    			attr_dev(button, "data-dismiss", "modal");
    			attr_dev(button, "aria-label", "Close");
    			add_location(button, file$5, 359, 44, 27659);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, span);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(359:40) {#if x<=767}",
    		ctx
    	});

    	return block;
    }

    // (38:0) <Router url="{url}">
    function create_default_slot$1(ctx) {
    	let t0;
    	let main;
    	let div123;
    	let aside0;
    	let div3;
    	let div2;
    	let div1;
    	let div0;
    	let a0;
    	let img0;
    	let img0_src_value;
    	let t1;
    	let aside3;
    	let div16;
    	let div15;
    	let div14;
    	let div4;
    	let img1;
    	let img1_src_value;
    	let t2;
    	let div5;
    	let img2;
    	let img2_src_value;
    	let t3;
    	let div11;
    	let div10;
    	let div9;
    	let h30;
    	let t4;
    	let i0;
    	let t5;
    	let h60;
    	let i1;
    	let t6;
    	let t7;
    	let h61;
    	let t9;
    	let div8;
    	let div7;
    	let button0;
    	let i2;
    	let t10;
    	let t11;
    	let div6;
    	let button1;
    	let t13;
    	let ul0;
    	let li0;
    	let a1;
    	let i3;
    	let t14;
    	let t15;
    	let li1;
    	let a2;
    	let i4;
    	let t16;
    	let t17;
    	let div13;
    	let div12;
    	let ul1;
    	let li2;
    	let a3;
    	let t19;
    	let li3;
    	let a4;
    	let t21;
    	let div122;
    	let div100;
    	let div99;
    	let aside1;
    	let section;
    	let div56;
    	let article0;
    	let div24;
    	let div23;
    	let div21;
    	let div20;
    	let div17;
    	let img3;
    	let img3_src_value;
    	let t22;
    	let div19;
    	let div18;
    	let h62;
    	let a5;
    	let t23;
    	let i5;
    	let t24;
    	let span0;
    	let i6;
    	let t25;
    	let t26;
    	let div22;
    	let i7;
    	let t27;
    	let ul2;
    	let li4;
    	let a6;
    	let i8;
    	let t28;
    	let t29;
    	let li5;
    	let a7;
    	let i9;
    	let t30;
    	let t31;
    	let li6;
    	let a8;
    	let i10;
    	let t32;
    	let t33;
    	let div25;
    	let h31;
    	let a9;
    	let t35;
    	let div26;
    	let img4;
    	let img4_src_value;
    	let t36;
    	let p0;
    	let t37;
    	let span1;
    	let span2;
    	let t40;
    	let span3;
    	let t42;
    	let div27;
    	let a10;
    	let button2;
    	let t44;
    	let div29;
    	let a11;
    	let img5;
    	let img5_src_value;
    	let t45;
    	let span4;
    	let t47;
    	let t48;
    	let div28;
    	let i11;
    	let t49;
    	let t50;
    	let article1;
    	let div37;
    	let div36;
    	let div34;
    	let div33;
    	let div30;
    	let img6;
    	let img6_src_value;
    	let t51;
    	let div32;
    	let div31;
    	let h63;
    	let a12;
    	let t52;
    	let i12;
    	let t53;
    	let span5;
    	let i13;
    	let t54;
    	let t55;
    	let div35;
    	let i14;
    	let t56;
    	let ul3;
    	let li7;
    	let a13;
    	let i15;
    	let t57;
    	let t58;
    	let li8;
    	let a14;
    	let i16;
    	let t59;
    	let t60;
    	let li9;
    	let a15;
    	let i17;
    	let t61;
    	let t62;
    	let div38;
    	let h32;
    	let a16;
    	let t64;
    	let div39;
    	let img7;
    	let img7_src_value;
    	let t65;
    	let p1;
    	let t66;
    	let span6;
    	let span7;
    	let t69;
    	let span8;
    	let t71;
    	let div40;
    	let a17;
    	let button3;
    	let t73;
    	let div42;
    	let a18;
    	let img8;
    	let img8_src_value;
    	let t74;
    	let span9;
    	let t76;
    	let t77;
    	let div41;
    	let i18;
    	let t78;
    	let t79;
    	let article2;
    	let div50;
    	let div49;
    	let div47;
    	let div46;
    	let div43;
    	let img9;
    	let img9_src_value;
    	let t80;
    	let div45;
    	let div44;
    	let h64;
    	let a19;
    	let t81;
    	let i19;
    	let t82;
    	let span10;
    	let i20;
    	let t83;
    	let t84;
    	let div48;
    	let i21;
    	let t85;
    	let ul4;
    	let li10;
    	let a20;
    	let i22;
    	let t86;
    	let t87;
    	let li11;
    	let a21;
    	let i23;
    	let t88;
    	let t89;
    	let li12;
    	let a22;
    	let i24;
    	let t90;
    	let t91;
    	let div51;
    	let h33;
    	let a23;
    	let t93;
    	let div52;
    	let img10;
    	let img10_src_value;
    	let t94;
    	let p2;
    	let t95;
    	let span11;
    	let span12;
    	let t98;
    	let span13;
    	let t100;
    	let div53;
    	let a24;
    	let button4;
    	let t102;
    	let div55;
    	let a25;
    	let img11;
    	let img11_src_value;
    	let t103;
    	let span14;
    	let t105;
    	let t106;
    	let div54;
    	let i25;
    	let t107;
    	let t108;
    	let aside2;
    	let div58;
    	let div57;
    	let img12;
    	let img12_src_value;
    	let t109;
    	let h34;
    	let t111;
    	let h65;
    	let t113;
    	let div98;
    	let div59;
    	let a26;
    	let i26;
    	let i26_class_value;
    	let t114;
    	let a26_type_value;
    	let a26_data_toggle_value;
    	let a26_data_target_value;
    	let span15;
    	let div59_class_value;
    	let t116;
    	let div97;
    	let div96;
    	let t117;
    	let div87;
    	let div60;
    	let h50;
    	let a27;
    	let t118;
    	let a28;
    	let p3;
    	let t120;
    	let div86;
    	let div85;
    	let div84;
    	let div83;
    	let div64;
    	let div61;
    	let h51;
    	let a29;
    	let t121;
    	let a30;
    	let p4;
    	let t123;
    	let div63;
    	let div62;
    	let t125;
    	let div68;
    	let div65;
    	let h52;
    	let a31;
    	let t126;
    	let a32;
    	let p5;
    	let t128;
    	let div67;
    	let div66;
    	let t130;
    	let div82;
    	let div69;
    	let h53;
    	let a33;
    	let t131;
    	let a34;
    	let p6;
    	let t133;
    	let div81;
    	let div80;
    	let div79;
    	let div78;
    	let div73;
    	let div70;
    	let h54;
    	let a35;
    	let t134;
    	let a36;
    	let p7;
    	let t136;
    	let div72;
    	let div71;
    	let t138;
    	let div77;
    	let div74;
    	let h55;
    	let a37;
    	let p8;
    	let t140;
    	let div76;
    	let div75;
    	let t142;
    	let div91;
    	let div88;
    	let h56;
    	let a38;
    	let t143;
    	let a39;
    	let p9;
    	let t145;
    	let div90;
    	let div89;
    	let t147;
    	let div95;
    	let div92;
    	let h57;
    	let a40;
    	let t148;
    	let a41;
    	let p10;
    	let t150;
    	let div94;
    	let div93;
    	let div96_class_value;
    	let div96_role_value;
    	let div97_class_value;
    	let div97_id_value;
    	let div97_tabindex_value;
    	let div97_role_value;
    	let div98_class_value;
    	let t152;
    	let div121;
    	let div120;
    	let div116;
    	let div115;
    	let h58;
    	let t154;
    	let p11;
    	let t156;
    	let div114;
    	let div113;
    	let div101;
    	let t158;
    	let div102;
    	let a42;
    	let t160;
    	let div103;
    	let t162;
    	let div104;
    	let t164;
    	let div105;
    	let t166;
    	let div106;
    	let t168;
    	let div107;
    	let t170;
    	let div108;
    	let t172;
    	let div109;
    	let t174;
    	let div110;
    	let t176;
    	let div111;
    	let t178;
    	let div112;
    	let t180;
    	let div119;
    	let div118;
    	let h59;
    	let t182;
    	let p12;
    	let t184;
    	let div117;
    	let main_transition;
    	let t185;
    	let br0;
    	let br1;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*y*/ ctx[1] > 600 && create_if_block_1$1(ctx);
    	let if_block1 = /*x*/ ctx[0] <= 767 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			main = element("main");
    			div123 = element("div");
    			aside0 = element("aside");
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			a0 = element("a");
    			img0 = element("img");
    			t1 = space();
    			aside3 = element("aside");
    			div16 = element("div");
    			div15 = element("div");
    			div14 = element("div");
    			div4 = element("div");
    			img1 = element("img");
    			t2 = space();
    			div5 = element("div");
    			img2 = element("img");
    			t3 = space();
    			div11 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			h30 = element("h3");
    			t4 = text("آفرینه ");
    			i0 = element("i");
    			t5 = space();
    			h60 = element("h6");
    			i1 = element("i");
    			t6 = text(" تهران,شهرک طالقانی,ساحتمان نگین");
    			t7 = space();
    			h61 = element("h6");
    			h61.textContent = "به آفرینه محلق شوید و بروز باشید.میتوانید مطالب مرتبط به کارآفرینی و بازاریابی رو از اینجا دنبال کنید اگر از محتوای ما خوشتان اومد آنرابا دیگران به اشتراک بگذارید.";
    			t9 = space();
    			div8 = element("div");
    			div7 = element("div");
    			button0 = element("button");
    			i2 = element("i");
    			t10 = text("بازدید سایت");
    			t11 = space();
    			div6 = element("div");
    			button1 = element("button");
    			button1.textContent = "بیشتر";
    			t13 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a1 = element("a");
    			i3 = element("i");
    			t14 = text(" اشتراک صفحه");
    			t15 = space();
    			li1 = element("li");
    			a2 = element("a");
    			i4 = element("i");
    			t16 = text(" گزارش دادن");
    			t17 = space();
    			div13 = element("div");
    			div12 = element("div");
    			ul1 = element("ul");
    			li2 = element("li");
    			a3 = element("a");
    			a3.textContent = "پست";
    			t19 = space();
    			li3 = element("li");
    			a4 = element("a");
    			a4.textContent = "درباره";
    			t21 = space();
    			div122 = element("div");
    			div100 = element("div");
    			div99 = element("div");
    			aside1 = element("aside");
    			section = element("section");
    			div56 = element("div");
    			article0 = element("article");
    			div24 = element("div");
    			div23 = element("div");
    			div21 = element("div");
    			div20 = element("div");
    			div17 = element("div");
    			img3 = element("img");
    			t22 = space();
    			div19 = element("div");
    			div18 = element("div");
    			h62 = element("h6");
    			a5 = element("a");
    			t23 = text("مرکز رشد و نواوری آفرینه ");
    			i5 = element("i");
    			t24 = space();
    			span0 = element("span");
    			i6 = element("i");
    			t25 = text(" ۳ دقیقه قبل");
    			t26 = space();
    			div22 = element("div");
    			i7 = element("i");
    			t27 = space();
    			ul2 = element("ul");
    			li4 = element("li");
    			a6 = element("a");
    			i8 = element("i");
    			t28 = text(" ذخیره کردن پست");
    			t29 = space();
    			li5 = element("li");
    			a7 = element("a");
    			i9 = element("i");
    			t30 = text(" کپی کردن لینک");
    			t31 = space();
    			li6 = element("li");
    			a8 = element("a");
    			i10 = element("i");
    			t32 = text(" گزارش دادن");
    			t33 = space();
    			div25 = element("div");
    			h31 = element("h3");
    			a9 = element("a");
    			a9.textContent = "به اینولینکس خوش آمدید";
    			t35 = space();
    			div26 = element("div");
    			img4 = element("img");
    			t36 = space();
    			p0 = element("p");
    			t37 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span1 = element("span");
    			span1.textContent = "...";
    			span2 = element("span");
    			span2.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t40 = space();
    			span3 = element("span");
    			span3.textContent = "بیشتر بخوانید";
    			t42 = space();
    			div27 = element("div");
    			a10 = element("a");
    			button2 = element("button");
    			button2.textContent = "ادامه مطلب";
    			t44 = space();
    			div29 = element("div");
    			a11 = element("a");
    			img5 = element("img");
    			t45 = space();
    			span4 = element("span");
    			span4.textContent = "مسعودآقایی ساداتی";
    			t47 = text("  ");
    			t48 = space();
    			div28 = element("div");
    			i11 = element("i");
    			t49 = text(" ۵۶");
    			t50 = space();
    			article1 = element("article");
    			div37 = element("div");
    			div36 = element("div");
    			div34 = element("div");
    			div33 = element("div");
    			div30 = element("div");
    			img6 = element("img");
    			t51 = space();
    			div32 = element("div");
    			div31 = element("div");
    			h63 = element("h6");
    			a12 = element("a");
    			t52 = text("مرکز رشد و نواوری آفرینه ");
    			i12 = element("i");
    			t53 = space();
    			span5 = element("span");
    			i13 = element("i");
    			t54 = text(" ۳ دقیقه قبل");
    			t55 = space();
    			div35 = element("div");
    			i14 = element("i");
    			t56 = space();
    			ul3 = element("ul");
    			li7 = element("li");
    			a13 = element("a");
    			i15 = element("i");
    			t57 = text(" ذخیره کردن پست");
    			t58 = space();
    			li8 = element("li");
    			a14 = element("a");
    			i16 = element("i");
    			t59 = text(" کپی کردن لینک");
    			t60 = space();
    			li9 = element("li");
    			a15 = element("a");
    			i17 = element("i");
    			t61 = text(" گزارش دادن");
    			t62 = space();
    			div38 = element("div");
    			h32 = element("h3");
    			a16 = element("a");
    			a16.textContent = "به اینولینکس خوش آمدید";
    			t64 = space();
    			div39 = element("div");
    			img7 = element("img");
    			t65 = space();
    			p1 = element("p");
    			t66 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span6 = element("span");
    			span6.textContent = "...";
    			span7 = element("span");
    			span7.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t69 = space();
    			span8 = element("span");
    			span8.textContent = "بیشتر بخوانید";
    			t71 = space();
    			div40 = element("div");
    			a17 = element("a");
    			button3 = element("button");
    			button3.textContent = "ادامه مطلب";
    			t73 = space();
    			div42 = element("div");
    			a18 = element("a");
    			img8 = element("img");
    			t74 = space();
    			span9 = element("span");
    			span9.textContent = "مسعودآقایی ساداتی";
    			t76 = text("  ");
    			t77 = space();
    			div41 = element("div");
    			i18 = element("i");
    			t78 = text(" ۵۶");
    			t79 = space();
    			article2 = element("article");
    			div50 = element("div");
    			div49 = element("div");
    			div47 = element("div");
    			div46 = element("div");
    			div43 = element("div");
    			img9 = element("img");
    			t80 = space();
    			div45 = element("div");
    			div44 = element("div");
    			h64 = element("h6");
    			a19 = element("a");
    			t81 = text("مرکز رشد و نواوری آفرینه ");
    			i19 = element("i");
    			t82 = space();
    			span10 = element("span");
    			i20 = element("i");
    			t83 = text(" ۳ دقیقه قبل");
    			t84 = space();
    			div48 = element("div");
    			i21 = element("i");
    			t85 = space();
    			ul4 = element("ul");
    			li10 = element("li");
    			a20 = element("a");
    			i22 = element("i");
    			t86 = text(" ذخیره کردن پست");
    			t87 = space();
    			li11 = element("li");
    			a21 = element("a");
    			i23 = element("i");
    			t88 = text(" کپی کردن لینک");
    			t89 = space();
    			li12 = element("li");
    			a22 = element("a");
    			i24 = element("i");
    			t90 = text(" گزارش دادن");
    			t91 = space();
    			div51 = element("div");
    			h33 = element("h3");
    			a23 = element("a");
    			a23.textContent = "به اینولینکس خوش آمدید";
    			t93 = space();
    			div52 = element("div");
    			img10 = element("img");
    			t94 = space();
    			p2 = element("p");
    			t95 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span11 = element("span");
    			span11.textContent = "...";
    			span12 = element("span");
    			span12.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                                            برای پر کردن صفحه و ارایه اولیه شکل \n                                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t98 = space();
    			span13 = element("span");
    			span13.textContent = "بیشتر بخوانید";
    			t100 = space();
    			div53 = element("div");
    			a24 = element("a");
    			button4 = element("button");
    			button4.textContent = "ادامه مطلب";
    			t102 = space();
    			div55 = element("div");
    			a25 = element("a");
    			img11 = element("img");
    			t103 = space();
    			span14 = element("span");
    			span14.textContent = "مسعودآقایی ساداتی";
    			t105 = text("  ");
    			t106 = space();
    			div54 = element("div");
    			i25 = element("i");
    			t107 = text(" ۵۶");
    			t108 = space();
    			aside2 = element("aside");
    			div58 = element("div");
    			div57 = element("div");
    			img12 = element("img");
    			t109 = space();
    			h34 = element("h3");
    			h34.textContent = "آفرینه";
    			t111 = space();
    			h65 = element("h6");
    			h65.textContent = "زندگی به سبک نوآوری";
    			t113 = space();
    			div98 = element("div");
    			div59 = element("div");
    			a26 = element("a");
    			i26 = element("i");
    			t114 = space();
    			span15 = element("span");
    			span15.textContent = "دسته بندی";
    			t116 = space();
    			div97 = element("div");
    			div96 = element("div");
    			if (if_block1) if_block1.c();
    			t117 = space();
    			div87 = element("div");
    			div60 = element("div");
    			h50 = element("h5");
    			a27 = element("a");
    			t118 = space();
    			a28 = element("a");
    			p3 = element("p");
    			p3.textContent = "بازاریابی";
    			t120 = space();
    			div86 = element("div");
    			div85 = element("div");
    			div84 = element("div");
    			div83 = element("div");
    			div64 = element("div");
    			div61 = element("div");
    			h51 = element("h5");
    			a29 = element("a");
    			t121 = space();
    			a30 = element("a");
    			p4 = element("p");
    			p4.textContent = "کسب و کار";
    			t123 = space();
    			div63 = element("div");
    			div62 = element("div");
    			div62.textContent = "فوتبال";
    			t125 = space();
    			div68 = element("div");
    			div65 = element("div");
    			h52 = element("h5");
    			a31 = element("a");
    			t126 = space();
    			a32 = element("a");
    			p5 = element("p");
    			p5.textContent = "مدیریت تلکنولوژی";
    			t128 = space();
    			div67 = element("div");
    			div66 = element("div");
    			div66.textContent = "خاورمیانه";
    			t130 = space();
    			div82 = element("div");
    			div69 = element("div");
    			h53 = element("h5");
    			a33 = element("a");
    			t131 = space();
    			a34 = element("a");
    			p6 = element("p");
    			p6.textContent = "آرشیو کلیپ ها";
    			t133 = space();
    			div81 = element("div");
    			div80 = element("div");
    			div79 = element("div");
    			div78 = element("div");
    			div73 = element("div");
    			div70 = element("div");
    			h54 = element("h5");
    			a35 = element("a");
    			t134 = space();
    			a36 = element("a");
    			p7 = element("p");
    			p7.textContent = "کسب و کار";
    			t136 = space();
    			div72 = element("div");
    			div71 = element("div");
    			div71.textContent = "فوتبال";
    			t138 = space();
    			div77 = element("div");
    			div74 = element("div");
    			h55 = element("h5");
    			a37 = element("a");
    			p8 = element("p");
    			p8.textContent = "مدیریت تلکنولوژی";
    			t140 = space();
    			div76 = element("div");
    			div75 = element("div");
    			div75.textContent = "خاورمیانه";
    			t142 = space();
    			div91 = element("div");
    			div88 = element("div");
    			h56 = element("h5");
    			a38 = element("a");
    			t143 = space();
    			a39 = element("a");
    			p9 = element("p");
    			p9.textContent = "مدیریت تلکنولوژی";
    			t145 = space();
    			div90 = element("div");
    			div89 = element("div");
    			div89.textContent = "خاورمیانه";
    			t147 = space();
    			div95 = element("div");
    			div92 = element("div");
    			h57 = element("h5");
    			a40 = element("a");
    			t148 = space();
    			a41 = element("a");
    			p10 = element("p");
    			p10.textContent = "آرشیو کلیپ ها";
    			t150 = space();
    			div94 = element("div");
    			div93 = element("div");
    			div93.textContent = "راهیان نور";
    			t152 = space();
    			div121 = element("div");
    			div120 = element("div");
    			div116 = element("div");
    			div115 = element("div");
    			h58 = element("h5");
    			h58.textContent = "درباره آفرینه";
    			t154 = space();
    			p11 = element("p");
    			p11.textContent = "لورم ایپسوم یک متن ساختگی برای طراحی و نمایش محتوای بی ربط است اما این متن نوشته شده هیچ ربطی به لورم ایپسوم ندارد.\n                                    این چیزی که میبینید صرفا یک متن ساختگی تر نسبت به لورم ایپسوم است تا شما بتواندی با گرفتن خروجی در سایت و موبایل یا هر دستگاه دیگر خروجی بگیرید و نگاه کنید که ساختار کد نوشتاری سایت با لورم به چه صورتی در آمده است.\n                                    با تشکر از سایت ساختگی نوشتار لورم ایپسوم آقای بوق";
    			t156 = space();
    			div114 = element("div");
    			div113 = element("div");
    			div101 = element("div");
    			div101.textContent = "وبسایت";
    			t158 = space();
    			div102 = element("div");
    			a42 = element("a");
    			a42.textContent = "http://afarine.com/";
    			t160 = space();
    			div103 = element("div");
    			div103.textContent = "نوع فعالیت";
    			t162 = space();
    			div104 = element("div");
    			div104.textContent = "کارآفرینی و کسب و کار - خصوصی";
    			t164 = space();
    			div105 = element("div");
    			div105.textContent = "میزان استخدام";
    			t166 = space();
    			div106 = element("div");
    			div106.textContent = "۱۲۰ + کارمند";
    			t168 = space();
    			div107 = element("div");
    			div107.textContent = "تاریخ تاسیس";
    			t170 = space();
    			div108 = element("div");
    			div108.textContent = "۲۰۱۸";
    			t172 = space();
    			div109 = element("div");
    			div109.textContent = "تخصص ها";
    			t174 = space();
    			div110 = element("div");
    			div110.textContent = "اشتغال/بازاریابی/کسب و کار/";
    			t176 = space();
    			div111 = element("div");
    			div111.textContent = "آدرس اصلی";
    			t178 = space();
    			div112 = element("div");
    			div112.textContent = "تهران,شهرک طالقانی,ساحتمان نگین";
    			t180 = space();
    			div119 = element("div");
    			div118 = element("div");
    			h59 = element("h5");
    			h59.textContent = "موقعیت مکانی آفرینه";
    			t182 = space();
    			p12 = element("p");
    			p12.textContent = "برای یافتن مکان دقیق باید زوم کنید";
    			t184 = space();
    			div117 = element("div");
    			t185 = space();
    			br0 = element("br");
    			br1 = element("br");
    			attr_dev(img0, "class", "w-100 dream-job-image");
    			if (img0.src !== (img0_src_value = "image/job.jpg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$5, 93, 32, 4030);
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$5, 92, 28, 3985);
    			attr_dev(div0, "class", "col-12 my-1");
    			add_location(div0, file$5, 91, 24, 3931);
    			attr_dev(div1, "class", "row ");
    			add_location(div1, file$5, 90, 20, 3888);
    			attr_dev(div2, "class", "col-12 shadow-radius-section bg-light");
    			add_location(div2, file$5, 89, 16, 3816);
    			attr_dev(div3, "class", "row");
    			add_location(div3, file$5, 88, 12, 3782);
    			attr_dev(aside0, "class", "col-12 col-md-3 mr-2 d-none d-lg-inline");
    			add_location(aside0, file$5, 87, 8, 3713);
    			attr_dev(img1, "class", " header-image bg-light");
    			if (img1.src !== (img1_src_value = "image/head.jpeg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$5, 105, 28, 4546);
    			attr_dev(div4, "class", "col-12 p-0 banner");
    			set_style(div4, "overflow", "hidden");
    			add_location(div4, file$5, 104, 24, 4460);
    			attr_dev(img2, "class", "header-logo-image");
    			if (img2.src !== (img2_src_value = "image/afarine.jpg")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "alt", "");
    			add_location(img2, file$5, 108, 28, 4734);
    			attr_dev(div5, "class", "col-12 header-image-main");
    			add_location(div5, file$5, 107, 24, 4667);
    			set_style(i0, "color", "#048af7");
    			set_style(i0, "font-size", "20px");
    			attr_dev(i0, "class", "fas fa-check-circle");
    			add_location(i0, file$5, 113, 70, 5056);
    			attr_dev(h30, "class", "text-bold");
    			add_location(h30, file$5, 113, 36, 5022);
    			attr_dev(i1, "class", "fas fa-map-marker-alt");
    			add_location(i1, file$5, 114, 63, 5199);
    			attr_dev(h60, "class", "text-secondary");
    			add_location(h60, file$5, 114, 36, 5172);
    			attr_dev(h61, "class", "explain-about-page");
    			add_location(h61, file$5, 115, 36, 5315);
    			attr_dev(i2, "class", "fas fa-external-link-alt padding-button ml-2 icon-size");
    			add_location(i2, file$5, 118, 140, 5780);
    			attr_dev(button0, "class", "btn rounded-pill mb-1 col-custom font btn-mw text-center visit-btn mx-0 mx-sm-1");
    			add_location(button0, file$5, 118, 44, 5684);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "data-toggle", "dropdown");
    			attr_dev(button1, "class", "pt-custome-more-btn btn btn-mw rounded-pill col-12 font text-center col-md-6 ");
    			add_location(button1, file$5, 120, 48, 6029);
    			attr_dev(i3, "class", "fas fa-share-alt");
    			add_location(i3, file$5, 122, 68, 6333);
    			attr_dev(a1, "href", "#");
    			add_location(a1, file$5, 122, 56, 6321);
    			add_location(li0, file$5, 122, 52, 6317);
    			attr_dev(i4, "class", "fas fa-flag");
    			add_location(i4, file$5, 123, 68, 6456);
    			attr_dev(a2, "href", "#");
    			add_location(a2, file$5, 123, 56, 6444);
    			add_location(li1, file$5, 123, 52, 6440);
    			attr_dev(ul0, "class", "dropdown-menu  ellipsis-menu");
    			add_location(ul0, file$5, 121, 48, 6223);
    			attr_dev(div6, "class", "col-5 justify-content-start dropdown dropleft pr-1");
    			add_location(div6, file$5, 119, 44, 5916);
    			attr_dev(div7, "class", "row");
    			add_location(div7, file$5, 117, 40, 5622);
    			attr_dev(div8, "class", "col-12 mt-4 font");
    			add_location(div8, file$5, 116, 36, 5551);
    			attr_dev(div9, "class", "col-10");
    			add_location(div9, file$5, 112, 32, 4965);
    			attr_dev(div10, "class", "row");
    			add_location(div10, file$5, 111, 28, 4915);
    			attr_dev(div11, "class", "header-detail col-12");
    			add_location(div11, file$5, 110, 24, 4852);
    			attr_dev(a3, "class", "py-2 nav-link-scroll");
    			attr_dev(a3, "data-toggle", "tab");
    			attr_dev(a3, "href", "#post");
    			toggle_class(a3, "active", /*current*/ ctx[3] === "post");
    			add_location(a3, file$5, 136, 73, 7187);
    			attr_dev(li2, "class", "nav-item-scroll mt-2");
    			add_location(li2, file$5, 136, 40, 7154);
    			attr_dev(a4, "class", "py-2 nav-link-scroll");
    			attr_dev(a4, "data-toggle", "tab");
    			attr_dev(a4, "href", "#about");
    			toggle_class(a4, "active", /*current*/ ctx[3] === "about");
    			add_location(a4, file$5, 137, 73, 7405);
    			attr_dev(li3, "class", "nav-item-scroll mt-2");
    			add_location(li3, file$5, 137, 40, 7372);
    			attr_dev(ul1, "class", "nav nav-tabs direction text-center");
    			attr_dev(ul1, "role", "tablist");
    			add_location(ul1, file$5, 135, 36, 7051);
    			attr_dev(div12, "class", "row  scroll-main-height");
    			add_location(div12, file$5, 134, 32, 6977);
    			attr_dev(div13, "class", "col-12 tab-header-main mt-3 ");
    			add_location(div13, file$5, 133, 28, 6902);
    			attr_dev(div14, "class", "row p-0 shadow-radius-section bg-white");
    			add_location(div14, file$5, 103, 20, 4382);
    			attr_dev(div15, "class", "col-12 ");
    			add_location(div15, file$5, 102, 16, 4340);
    			attr_dev(div16, "class", "row ml-md-1 ");
    			add_location(div16, file$5, 101, 12, 4297);
    			attr_dev(img3, "class", "cu-image-com mr-1 ");
    			if (img3.src !== (img3_src_value = "image/afarine.jpg")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "alt", "");
    			add_location(img3, file$5, 157, 60, 8819);
    			attr_dev(div17, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div17, file$5, 156, 56, 8689);
    			set_style(i5, "color", "#048af7");
    			attr_dev(i5, "class", "fas fa-check-circle");
    			add_location(i5, file$5, 161, 141, 9354);
    			attr_dev(a5, "href", "magezine");
    			attr_dev(a5, "class", "title-post-link");
    			add_location(a5, file$5, 161, 68, 9281);
    			add_location(h62, file$5, 161, 64, 9277);
    			attr_dev(i6, "class", "fas fa-clock");
    			add_location(i6, file$5, 162, 96, 9518);
    			attr_dev(span0, "class", "show-time-custome");
    			add_location(span0, file$5, 162, 64, 9486);
    			attr_dev(div18, "class", "cu-intro mt-2");
    			add_location(div18, file$5, 160, 60, 9185);
    			attr_dev(div19, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-0 pr-md-4 mr-lg-2 mr-xl-0 pr-xl-3 justify-content-center custome-margin-right ");
    			add_location(div19, file$5, 159, 56, 9002);
    			attr_dev(div20, "class", "row ");
    			add_location(div20, file$5, 155, 52, 8614);
    			attr_dev(div21, "class", "col-11 col-md-11");
    			add_location(div21, file$5, 154, 48, 8530);
    			attr_dev(i7, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i7, "type", "button");
    			attr_dev(i7, "data-toggle", "dropdown");
    			add_location(i7, file$5, 168, 52, 9972);
    			attr_dev(i8, "class", "far fa-bookmark");
    			add_location(i8, file$5, 170, 136, 10276);
    			attr_dev(a6, "class", "dropdown-item");
    			attr_dev(a6, "href", "#");
    			add_location(a6, file$5, 170, 101, 10241);
    			add_location(li4, file$5, 170, 56, 10196);
    			attr_dev(i9, "class", "fas fa-share-alt");
    			add_location(i9, file$5, 171, 94, 10427);
    			attr_dev(a7, "class", "dropdown-item");
    			attr_dev(a7, "href", "#");
    			add_location(a7, file$5, 171, 60, 10393);
    			add_location(li5, file$5, 171, 56, 10389);
    			attr_dev(i10, "class", "fas fa-flag");
    			add_location(i10, file$5, 172, 94, 10578);
    			attr_dev(a8, "class", "dropdown-item");
    			attr_dev(a8, "href", "#");
    			add_location(a8, file$5, 172, 60, 10544);
    			add_location(li6, file$5, 172, 56, 10540);
    			attr_dev(ul2, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul2, file$5, 169, 52, 10099);
    			attr_dev(div22, "class", "dropdown col-1 ml-0 pl-0 pr-3  pr-md-3 pr-lg-4 ");
    			add_location(div22, file$5, 167, 48, 9858);
    			attr_dev(div23, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div23, file$5, 153, 44, 8423);
    			attr_dev(div24, "class", "col-12");
    			add_location(div24, file$5, 152, 40, 8358);
    			attr_dev(a9, "class", "title-post-link");
    			attr_dev(a9, "href", "magezine/show-detail");
    			add_location(a9, file$5, 179, 88, 11031);
    			attr_dev(h31, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h31, file$5, 179, 44, 10987);
    			attr_dev(div25, "class", "col-12 p-0");
    			add_location(div25, file$5, 178, 40, 10918);
    			if (img4.src !== (img4_src_value = "image/30.jpg")) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img4, "alt", "");
    			add_location(img4, file$5, 182, 44, 11307);
    			attr_dev(div26, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div26, file$5, 181, 40, 11205);
    			attr_dev(span1, "id", "dots");
    			add_location(span1, file$5, 188, 130, 11950);
    			attr_dev(span2, "id", "more");
    			add_location(span2, file$5, 188, 156, 11976);
    			attr_dev(span3, "id", "myBtn");
    			set_style(span3, "cursor", "pointer");
    			add_location(span3, file$5, 195, 44, 12751);
    			attr_dev(p0, "class", "col-12 mt-3 post-text");
    			add_location(p0, file$5, 185, 40, 11518);
    			attr_dev(button2, "id", "read-more");
    			attr_dev(button2, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button2, file$5, 200, 48, 13112);
    			attr_dev(a10, "href", "magezine/show-detail");
    			add_location(a10, file$5, 199, 44, 13032);
    			attr_dev(div27, "class", "col-12 ");
    			add_location(div27, file$5, 198, 40, 12966);
    			attr_dev(img5, "class", "personal-img");
    			if (img5.src !== (img5_src_value = "image/1.jpeg")) attr_dev(img5, "src", img5_src_value);
    			attr_dev(img5, "alt", "");
    			add_location(img5, file$5, 206, 48, 13585);
    			attr_dev(span4, "class", "personal-name");
    			add_location(span4, file$5, 207, 48, 13686);
    			attr_dev(a11, "class", "a-clicked");
    			attr_dev(a11, "href", "profile");
    			add_location(a11, file$5, 205, 44, 13500);
    			attr_dev(i11, "class", "fas fa-eye");
    			add_location(i11, file$5, 209, 68, 13869);
    			attr_dev(div28, "class", "view-count");
    			add_location(div28, file$5, 209, 44, 13845);
    			attr_dev(div29, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div29, file$5, 204, 40, 13409);
    			attr_dev(article0, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article0, file$5, 151, 36, 8244);
    			attr_dev(img6, "class", "cu-image-com mr-1 ");
    			if (img6.src !== (img6_src_value = "image/afarine.jpg")) attr_dev(img6, "src", img6_src_value);
    			attr_dev(img6, "alt", "");
    			add_location(img6, file$5, 218, 60, 14610);
    			attr_dev(div30, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div30, file$5, 217, 56, 14480);
    			set_style(i12, "color", "#048af7");
    			attr_dev(i12, "class", "fas fa-check-circle");
    			add_location(i12, file$5, 222, 141, 15145);
    			attr_dev(a12, "href", "magezine");
    			attr_dev(a12, "class", "title-post-link");
    			add_location(a12, file$5, 222, 68, 15072);
    			add_location(h63, file$5, 222, 64, 15068);
    			attr_dev(i13, "class", "fas fa-clock");
    			add_location(i13, file$5, 223, 96, 15309);
    			attr_dev(span5, "class", "show-time-custome");
    			add_location(span5, file$5, 223, 64, 15277);
    			attr_dev(div31, "class", "cu-intro mt-2");
    			add_location(div31, file$5, 221, 60, 14976);
    			attr_dev(div32, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-0 pr-md-4 mr-lg-2 mr-xl-0 pr-xl-3 justify-content-center custome-margin-right ");
    			add_location(div32, file$5, 220, 56, 14793);
    			attr_dev(div33, "class", "row ");
    			add_location(div33, file$5, 216, 52, 14405);
    			attr_dev(div34, "class", "col-11 col-md-11");
    			add_location(div34, file$5, 215, 48, 14321);
    			attr_dev(i14, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i14, "type", "button");
    			attr_dev(i14, "data-toggle", "dropdown");
    			add_location(i14, file$5, 229, 52, 15778);
    			attr_dev(i15, "class", "far fa-bookmark");
    			add_location(i15, file$5, 231, 136, 16082);
    			attr_dev(a13, "class", "dropdown-item");
    			attr_dev(a13, "href", "#");
    			add_location(a13, file$5, 231, 101, 16047);
    			add_location(li7, file$5, 231, 56, 16002);
    			attr_dev(i16, "class", "fas fa-share-alt");
    			add_location(i16, file$5, 232, 94, 16233);
    			attr_dev(a14, "class", "dropdown-item");
    			attr_dev(a14, "href", "#");
    			add_location(a14, file$5, 232, 60, 16199);
    			add_location(li8, file$5, 232, 56, 16195);
    			attr_dev(i17, "class", "fas fa-flag");
    			add_location(i17, file$5, 233, 94, 16384);
    			attr_dev(a15, "class", "dropdown-item");
    			attr_dev(a15, "href", "#");
    			add_location(a15, file$5, 233, 60, 16350);
    			add_location(li9, file$5, 233, 56, 16346);
    			attr_dev(ul3, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul3, file$5, 230, 52, 15905);
    			attr_dev(div35, "class", "dropdown col-1 ml-0 pl-0 pr-3 pr-sm-4 pr-md-3 pr-lg-3 pr-xl-4 ");
    			add_location(div35, file$5, 228, 48, 15649);
    			attr_dev(div36, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div36, file$5, 214, 44, 14214);
    			attr_dev(div37, "class", "col-12");
    			add_location(div37, file$5, 213, 40, 14149);
    			attr_dev(a16, "class", "title-post-link");
    			attr_dev(a16, "href", "magezine/show-detail");
    			add_location(a16, file$5, 240, 88, 16837);
    			attr_dev(h32, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h32, file$5, 240, 44, 16793);
    			attr_dev(div38, "class", "col-12 p-0");
    			add_location(div38, file$5, 239, 40, 16724);
    			if (img7.src !== (img7_src_value = "image/30.jpg")) attr_dev(img7, "src", img7_src_value);
    			attr_dev(img7, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img7, "alt", "");
    			add_location(img7, file$5, 243, 44, 17113);
    			attr_dev(div39, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div39, file$5, 242, 40, 17011);
    			attr_dev(span6, "id", "dots");
    			add_location(span6, file$5, 249, 130, 17756);
    			attr_dev(span7, "id", "more");
    			add_location(span7, file$5, 249, 156, 17782);
    			attr_dev(span8, "id", "myBtn");
    			set_style(span8, "cursor", "pointer");
    			add_location(span8, file$5, 256, 44, 18557);
    			attr_dev(p1, "class", "col-12 mt-3 post-text");
    			add_location(p1, file$5, 246, 40, 17324);
    			attr_dev(button3, "id", "read-more");
    			attr_dev(button3, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button3, file$5, 261, 48, 18918);
    			attr_dev(a17, "href", "magezine/show-detail");
    			add_location(a17, file$5, 260, 44, 18838);
    			attr_dev(div40, "class", "col-12 ");
    			add_location(div40, file$5, 259, 40, 18772);
    			attr_dev(img8, "class", "personal-img");
    			if (img8.src !== (img8_src_value = "image/1.jpeg")) attr_dev(img8, "src", img8_src_value);
    			attr_dev(img8, "alt", "");
    			add_location(img8, file$5, 267, 48, 19391);
    			attr_dev(span9, "class", "personal-name");
    			add_location(span9, file$5, 268, 48, 19492);
    			attr_dev(a18, "class", "a-clicked");
    			attr_dev(a18, "href", "profile");
    			add_location(a18, file$5, 266, 44, 19306);
    			attr_dev(i18, "class", "fas fa-eye");
    			add_location(i18, file$5, 270, 68, 19675);
    			attr_dev(div41, "class", "view-count");
    			add_location(div41, file$5, 270, 44, 19651);
    			attr_dev(div42, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div42, file$5, 265, 40, 19215);
    			attr_dev(article1, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article1, file$5, 212, 36, 14035);
    			attr_dev(img9, "class", "cu-image-com mr-1 ");
    			if (img9.src !== (img9_src_value = "image/afarine.jpg")) attr_dev(img9, "src", img9_src_value);
    			attr_dev(img9, "alt", "");
    			add_location(img9, file$5, 279, 60, 20416);
    			attr_dev(div43, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div43, file$5, 278, 56, 20286);
    			set_style(i19, "color", "#048af7");
    			attr_dev(i19, "class", "fas fa-check-circle");
    			add_location(i19, file$5, 283, 141, 20951);
    			attr_dev(a19, "href", "magezine");
    			attr_dev(a19, "class", "title-post-link");
    			add_location(a19, file$5, 283, 68, 20878);
    			add_location(h64, file$5, 283, 64, 20874);
    			attr_dev(i20, "class", "fas fa-clock");
    			add_location(i20, file$5, 284, 96, 21115);
    			attr_dev(span10, "class", "show-time-custome");
    			add_location(span10, file$5, 284, 64, 21083);
    			attr_dev(div44, "class", "cu-intro mt-2");
    			add_location(div44, file$5, 282, 60, 20782);
    			attr_dev(div45, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-0 pr-md-4 mr-lg-2 mr-xl-0 pr-xl-3 justify-content-center custome-margin-right ");
    			add_location(div45, file$5, 281, 56, 20599);
    			attr_dev(div46, "class", "row ");
    			add_location(div46, file$5, 277, 52, 20211);
    			attr_dev(div47, "class", "col-11 col-md-11");
    			add_location(div47, file$5, 276, 48, 20127);
    			attr_dev(i21, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i21, "type", "button");
    			attr_dev(i21, "data-toggle", "dropdown");
    			add_location(i21, file$5, 290, 52, 21569);
    			attr_dev(i22, "class", "far fa-bookmark");
    			add_location(i22, file$5, 292, 136, 21873);
    			attr_dev(a20, "class", "dropdown-item");
    			attr_dev(a20, "href", "#");
    			add_location(a20, file$5, 292, 101, 21838);
    			add_location(li10, file$5, 292, 56, 21793);
    			attr_dev(i23, "class", "fas fa-share-alt");
    			add_location(i23, file$5, 293, 94, 22024);
    			attr_dev(a21, "class", "dropdown-item");
    			attr_dev(a21, "href", "#");
    			add_location(a21, file$5, 293, 60, 21990);
    			add_location(li11, file$5, 293, 56, 21986);
    			attr_dev(i24, "class", "fas fa-flag");
    			add_location(i24, file$5, 294, 94, 22175);
    			attr_dev(a22, "class", "dropdown-item");
    			attr_dev(a22, "href", "#");
    			add_location(a22, file$5, 294, 60, 22141);
    			add_location(li12, file$5, 294, 56, 22137);
    			attr_dev(ul4, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul4, file$5, 291, 52, 21696);
    			attr_dev(div48, "class", "dropdown col-1 ml-0 pl-0 pr-3  pr-md-3 pr-lg-4 ");
    			add_location(div48, file$5, 289, 48, 21455);
    			attr_dev(div49, "class", "row justify-content-between p-2 pl-4 pl-md-2");
    			add_location(div49, file$5, 275, 44, 20020);
    			attr_dev(div50, "class", "col-12");
    			add_location(div50, file$5, 274, 40, 19955);
    			attr_dev(a23, "class", "title-post-link");
    			attr_dev(a23, "href", "magezine/show-detail");
    			add_location(a23, file$5, 301, 88, 22628);
    			attr_dev(h33, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h33, file$5, 301, 44, 22584);
    			attr_dev(div51, "class", "col-12 p-0");
    			add_location(div51, file$5, 300, 40, 22515);
    			if (img10.src !== (img10_src_value = "image/30.jpg")) attr_dev(img10, "src", img10_src_value);
    			attr_dev(img10, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img10, "alt", "");
    			add_location(img10, file$5, 304, 44, 22904);
    			attr_dev(div52, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div52, file$5, 303, 40, 22802);
    			attr_dev(span11, "id", "dots");
    			add_location(span11, file$5, 310, 130, 23547);
    			attr_dev(span12, "id", "more");
    			add_location(span12, file$5, 310, 156, 23573);
    			attr_dev(span13, "id", "myBtn");
    			set_style(span13, "cursor", "pointer");
    			add_location(span13, file$5, 317, 44, 24348);
    			attr_dev(p2, "class", "col-12 mt-3 post-text");
    			add_location(p2, file$5, 307, 40, 23115);
    			attr_dev(button4, "id", "read-more");
    			attr_dev(button4, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button4, file$5, 322, 48, 24709);
    			attr_dev(a24, "href", "magezine/show-detail");
    			add_location(a24, file$5, 321, 44, 24629);
    			attr_dev(div53, "class", "col-12 ");
    			add_location(div53, file$5, 320, 40, 24563);
    			attr_dev(img11, "class", "personal-img");
    			if (img11.src !== (img11_src_value = "image/1.jpeg")) attr_dev(img11, "src", img11_src_value);
    			attr_dev(img11, "alt", "");
    			add_location(img11, file$5, 328, 48, 25182);
    			attr_dev(span14, "class", "personal-name");
    			add_location(span14, file$5, 329, 48, 25283);
    			attr_dev(a25, "class", "a-clicked");
    			attr_dev(a25, "href", "profile");
    			add_location(a25, file$5, 327, 44, 25097);
    			attr_dev(i25, "class", "fas fa-eye");
    			add_location(i25, file$5, 331, 68, 25466);
    			attr_dev(div54, "class", "view-count");
    			add_location(div54, file$5, 331, 44, 25442);
    			attr_dev(div55, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div55, file$5, 326, 40, 25006);
    			attr_dev(article2, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article2, file$5, 273, 36, 19841);
    			attr_dev(div56, "class", "col-12 p-0 main-article ");
    			add_location(div56, file$5, 150, 32, 8169);
    			attr_dev(section, "class", "row mx-0 mt-3 mr-0 pt-0  ");
    			add_location(section, file$5, 149, 28, 8093);
    			attr_dev(aside1, "class", "col-12 col-md-9 order-first justify-content-between order-md-0 mx-0 ");
    			add_location(aside1, file$5, 148, 24, 7980);
    			attr_dev(img12, "class", "company-img  w-100");
    			if (img12.src !== (img12_src_value = "image/afarine.jpg")) attr_dev(img12, "src", img12_src_value);
    			attr_dev(img12, "alt", "");
    			add_location(img12, file$5, 341, 36, 26033);
    			attr_dev(div57, "class", "col-10 mx-auto mt-5 mb-3 ");
    			add_location(div57, file$5, 340, 32, 25957);
    			attr_dev(h34, "class", "col-12");
    			add_location(h34, file$5, 343, 32, 26168);
    			attr_dev(h65, "class", "col-12");
    			add_location(h65, file$5, 346, 32, 26301);
    			attr_dev(div58, "class", "row px-0 text-center shadow-radius-section bg-light ");
    			toggle_class(div58, "d-none", /*x*/ ctx[0] <= 767);
    			add_location(div58, file$5, 339, 28, 25836);

    			attr_dev(i26, "class", i26_class_value = "" + ((/*x*/ ctx[0] >= 767
    			? "fas fa-list-ul category-icon-modal"
    			: "fas fa-caret-left") + " "));

    			toggle_class(i26, "category-fixed-icon-modal", /*x*/ ctx[0] <= 767 && /*y*/ ctx[1] >= 400);
    			add_location(i26, file$5, 353, 40, 26921);
    			attr_dev(a26, "type", a26_type_value = /*x*/ ctx[0] <= 767 ? "button" : "");
    			attr_dev(a26, "class", "btn ");
    			attr_dev(a26, "data-toggle", a26_data_toggle_value = /*x*/ ctx[0] <= 767 ? "modal" : "");
    			attr_dev(a26, "data-target", a26_data_target_value = /*x*/ ctx[0] <= 767 ? "#myModal2" : "");
    			add_location(a26, file$5, 352, 36, 26751);
    			attr_dev(span15, "class", "d-none d-md-inline");
    			add_location(span15, file$5, 354, 40, 27099);

    			attr_dev(div59, "class", div59_class_value = /*x*/ ctx[0] >= 767
    			? "col-12 font-weight-bold pb-2 border-bottom pr-0"
    			: "col-12 font-weight-bold");

    			add_location(div59, file$5, 351, 32, 26612);
    			attr_dev(a27, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a27, "data-toggle", "collapse");
    			attr_dev(a27, "data-target", "#collapseOne");
    			attr_dev(a27, "aria-expanded", "true");
    			attr_dev(a27, "aria-controls", "collapseOne");
    			add_location(a27, file$5, 370, 46, 28390);
    			attr_dev(p3, "class", "category-main-text d-inline");
    			add_location(p3, file$5, 372, 48, 28684);
    			attr_dev(a28, "href", "#");
    			attr_dev(a28, "class", "category-main-text-link");
    			add_location(a28, file$5, 371, 46, 28591);
    			attr_dev(h50, "class", "mb-0");
    			add_location(h50, file$5, 369, 44, 28326);
    			attr_dev(div60, "class", "border-bottom pb-2");
    			attr_dev(div60, "id", "headingOne");
    			add_location(div60, file$5, 368, 42, 28233);
    			attr_dev(a29, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a29, "data-toggle", "collapse");
    			attr_dev(a29, "data-target", "#collapseOneOne");
    			attr_dev(a29, "aria-expanded", "true");
    			attr_dev(a29, "aria-controls", "collapseOneOne");
    			add_location(a29, file$5, 383, 62, 29589);
    			attr_dev(p4, "class", "category-main-text d-inline");
    			add_location(p4, file$5, 385, 64, 29921);
    			attr_dev(a30, "href", "#");
    			attr_dev(a30, "class", "category-main-text-link");
    			add_location(a30, file$5, 384, 62, 29812);
    			attr_dev(h51, "class", "mb-0");
    			add_location(h51, file$5, 382, 60, 29509);
    			attr_dev(div61, "class", "border-bottom pb-2");
    			attr_dev(div61, "id", "headingOneOne");
    			add_location(div61, file$5, 381, 58, 29397);
    			attr_dev(div62, "class", "");
    			add_location(div62, file$5, 390, 60, 30397);
    			attr_dev(div63, "id", "collapseOneOne");
    			attr_dev(div63, "class", "collapse mr-3 ");
    			attr_dev(div63, "aria-labelledby", "headingOneOne");
    			attr_dev(div63, "data-parent", "#accordion1");
    			add_location(div63, file$5, 389, 58, 30230);
    			attr_dev(div64, "class", "mb-2 pl-2");
    			add_location(div64, file$5, 380, 56, 29315);
    			attr_dev(a31, "href", "#");
    			attr_dev(a31, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a31, "data-toggle", "collapse");
    			attr_dev(a31, "data-target", "#collapseTwoTwo");
    			attr_dev(a31, "aria-expanded", "false");
    			attr_dev(a31, "aria-controls", "collapseTwoTwo");
    			add_location(a31, file$5, 398, 62, 31007);
    			attr_dev(p5, "class", "category-main-text d-inline");
    			add_location(p5, file$5, 400, 64, 31348);
    			attr_dev(a32, "href", "#");
    			attr_dev(a32, "class", "category-main-text-link");
    			add_location(a32, file$5, 399, 62, 31239);
    			attr_dev(h52, "class", "mb-0");
    			add_location(h52, file$5, 397, 60, 30927);
    			attr_dev(div65, "class", "border-bottom pb-2");
    			attr_dev(div65, "id", "headingTwoTwo");
    			add_location(div65, file$5, 396, 58, 30815);
    			attr_dev(div66, "class", "");
    			add_location(div66, file$5, 405, 60, 31830);
    			attr_dev(div67, "id", "collapseTwoTwo");
    			attr_dev(div67, "class", "collapse mr-3");
    			attr_dev(div67, "aria-labelledby", "headingTwoTwo");
    			attr_dev(div67, "data-parent", "#accordion1");
    			add_location(div67, file$5, 404, 58, 31664);
    			attr_dev(div68, "class", "mb-2 pl-2");
    			add_location(div68, file$5, 395, 56, 30733);
    			attr_dev(a33, "href", "#");
    			attr_dev(a33, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a33, "data-toggle", "collapse");
    			attr_dev(a33, "data-target", "#collapseThreeThree");
    			attr_dev(a33, "aria-expanded", "false");
    			attr_dev(a33, "aria-controls", "collapseThreeThree");
    			add_location(a33, file$5, 413, 62, 32446);
    			attr_dev(p6, "class", "category-main-text d-inline");
    			add_location(p6, file$5, 415, 64, 32795);
    			attr_dev(a34, "href", "#");
    			attr_dev(a34, "class", "category-main-text-link");
    			add_location(a34, file$5, 414, 62, 32686);
    			attr_dev(h53, "class", "mb-0");
    			add_location(h53, file$5, 412, 60, 32366);
    			attr_dev(div69, "class", "border-bottom pb-2");
    			attr_dev(div69, "id", "headingThreeThree");
    			add_location(div69, file$5, 411, 58, 32250);
    			attr_dev(a35, "class", "p-0 d-inline category_button collapsed ");
    			attr_dev(a35, "data-toggle", "collapse");
    			attr_dev(a35, "data-target", "#collapseOneOneOne");
    			attr_dev(a35, "aria-expanded", "true");
    			attr_dev(a35, "aria-controls", "collapseOneOneOne");
    			add_location(a35, file$5, 426, 78, 33897);
    			attr_dev(p7, "class", "category-main-text d-inline");
    			add_location(p7, file$5, 428, 80, 34267);
    			attr_dev(a36, "href", "#");
    			attr_dev(a36, "class", "category-main-text-link");
    			add_location(a36, file$5, 427, 78, 34142);
    			attr_dev(h54, "class", "mb-0");
    			add_location(h54, file$5, 425, 76, 33801);
    			attr_dev(div70, "class", "border-bottom pb-2");
    			attr_dev(div70, "id", "headingOneOneOne");
    			add_location(div70, file$5, 424, 74, 33670);
    			attr_dev(div71, "class", "");
    			add_location(div71, file$5, 433, 76, 34829);
    			attr_dev(div72, "id", "collapseOneOneOne");
    			attr_dev(div72, "class", "collapse mr-3 ");
    			attr_dev(div72, "aria-labelledby", "headingOneOneOne");
    			attr_dev(div72, "data-parent", "#accordion2");
    			add_location(div72, file$5, 432, 74, 34640);
    			attr_dev(div73, "class", "mb-2 pl-2");
    			add_location(div73, file$5, 423, 72, 33572);
    			attr_dev(p8, "class", "category-main-text d-inline");
    			add_location(p8, file$5, 442, 80, 35695);
    			attr_dev(a37, "href", "#");
    			attr_dev(a37, "class", "category-main-text-link");
    			add_location(a37, file$5, 441, 78, 35570);
    			attr_dev(h55, "class", "mb-0");
    			add_location(h55, file$5, 440, 76, 35474);
    			attr_dev(div74, "class", "border-bottom pb-2");
    			attr_dev(div74, "id", "headingTwoTwoTwo");
    			add_location(div74, file$5, 439, 74, 35343);
    			attr_dev(div75, "class", "");
    			add_location(div75, file$5, 447, 76, 36263);
    			attr_dev(div76, "id", "collapseTwoTwoTwo");
    			attr_dev(div76, "class", "collapse mr-3");
    			attr_dev(div76, "aria-labelledby", "headingTwoTwoTwo");
    			attr_dev(div76, "data-parent", "#accordion2");
    			add_location(div76, file$5, 446, 74, 36075);
    			attr_dev(div77, "class", "mb-2 pl-2");
    			add_location(div77, file$5, 438, 72, 35245);
    			attr_dev(div78, "id", "accordion2");
    			add_location(div78, file$5, 422, 68, 33478);
    			attr_dev(div79, "class", " mt-2 mr-1 col-12 p-0 ");
    			add_location(div79, file$5, 421, 64, 33373);
    			attr_dev(div80, "class", "border-right");
    			add_location(div80, file$5, 420, 60, 33282);
    			attr_dev(div81, "id", "collapseThreeThree");
    			attr_dev(div81, "class", "collapse mr-3");
    			attr_dev(div81, "aria-labelledby", "headingThreeThree");
    			attr_dev(div81, "data-parent", "#accordion1");
    			add_location(div81, file$5, 419, 58, 33108);
    			attr_dev(div82, "class", "mb-2 pl-2");
    			add_location(div82, file$5, 410, 56, 32168);
    			attr_dev(div83, "id", "accordion1");
    			add_location(div83, file$5, 379, 52, 29237);
    			attr_dev(div84, "class", " mt-2 mr-1 col-12 p-0 ");
    			add_location(div84, file$5, 378, 48, 29148);
    			attr_dev(div85, "class", "border-right");
    			add_location(div85, file$5, 377, 44, 29073);
    			attr_dev(div86, "id", "collapseOne");
    			attr_dev(div86, "class", "collapse mr-3 ");
    			attr_dev(div86, "aria-labelledby", "headingOne");
    			attr_dev(div86, "data-parent", "#accordion");
    			add_location(div86, file$5, 376, 42, 28929);
    			attr_dev(div87, "class", "mb-2 pl-2 ");
    			add_location(div87, file$5, 367, 40, 28166);
    			attr_dev(a38, "href", "#");
    			attr_dev(a38, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a38, "data-toggle", "collapse");
    			attr_dev(a38, "data-target", "#collapseTwo");
    			attr_dev(a38, "aria-expanded", "false");
    			attr_dev(a38, "aria-controls", "collapseTwo");
    			add_location(a38, file$5, 465, 46, 37480);
    			attr_dev(p9, "class", "category-main-text d-inline");
    			add_location(p9, file$5, 467, 48, 37783);
    			attr_dev(a39, "href", "#");
    			attr_dev(a39, "class", "category-main-text-link");
    			add_location(a39, file$5, 466, 46, 37690);
    			attr_dev(h56, "class", "mb-0");
    			add_location(h56, file$5, 464, 44, 37416);
    			attr_dev(div88, "class", "border-bottom pb-2");
    			attr_dev(div88, "id", "headingTwo");
    			add_location(div88, file$5, 463, 42, 37323);
    			attr_dev(div89, "class", "");
    			add_location(div89, file$5, 472, 44, 38178);
    			attr_dev(div90, "id", "collapseTwo");
    			attr_dev(div90, "class", "collapse mr-3");
    			attr_dev(div90, "aria-labelledby", "headingTwo");
    			attr_dev(div90, "data-parent", "#accordion");
    			add_location(div90, file$5, 471, 42, 38035);
    			attr_dev(div91, "class", "mb-2 pl-2");
    			add_location(div91, file$5, 462, 40, 37257);
    			attr_dev(a40, "href", "#");
    			attr_dev(a40, "class", "p-0 d-inline category_button collapsed");
    			attr_dev(a40, "data-toggle", "collapse");
    			attr_dev(a40, "data-target", "#collapseThree");
    			attr_dev(a40, "aria-expanded", "false");
    			attr_dev(a40, "aria-controls", "collapseThree");
    			add_location(a40, file$5, 480, 46, 38661);
    			attr_dev(p10, "class", "category-main-text d-inline");
    			add_location(p10, file$5, 482, 48, 38968);
    			attr_dev(a41, "href", "#");
    			attr_dev(a41, "class", "category-main-text-link");
    			add_location(a41, file$5, 481, 46, 38875);
    			attr_dev(h57, "class", "mb-0");
    			add_location(h57, file$5, 479, 44, 38597);
    			attr_dev(div92, "class", "border-bottom pb-2");
    			attr_dev(div92, "id", "headingThree");
    			add_location(div92, file$5, 478, 42, 38502);
    			attr_dev(div93, "class", "");
    			add_location(div93, file$5, 487, 44, 39364);
    			attr_dev(div94, "id", "collapseThree");
    			attr_dev(div94, "class", "collapse mr-3");
    			attr_dev(div94, "aria-labelledby", "headingThree");
    			attr_dev(div94, "data-parent", "#accordion");
    			add_location(div94, file$5, 486, 42, 39217);
    			attr_dev(div95, "class", "mb-2 pl-2");
    			add_location(div95, file$5, 477, 40, 38436);
    			attr_dev(div96, "id", "accordion");

    			attr_dev(div96, "class", div96_class_value = /*x*/ ctx[0] <= 767
    			? "modal-dialog modal-content pr-2"
    			: "");

    			attr_dev(div96, "role", div96_role_value = /*x*/ ctx[0] <= 767 ? "document" : "");
    			add_location(div96, file$5, 357, 36, 27449);
    			attr_dev(div97, "class", div97_class_value = "" + ((/*x*/ ctx[0] <= 767 ? "modal right" : "") + " mt-2 mr-1 col-12 p-0 d-lg-inline"));
    			attr_dev(div97, "id", div97_id_value = /*x*/ ctx[0] <= 767 ? "myModal2" : "");
    			attr_dev(div97, "tabindex", div97_tabindex_value = /*x*/ ctx[0] <= 767 ? "-1" : "");
    			attr_dev(div97, "role", div97_role_value = /*x*/ ctx[0] <= 767 ? "dialog" : "");
    			attr_dev(div97, "aria-hidden", "true");
    			add_location(div97, file$5, 356, 32, 27221);

    			attr_dev(div98, "class", div98_class_value = /*x*/ ctx[0] >= 767
    			? "row direction shadow-radius-section mt-4 py-2 bg-white"
    			: "row direction ");

    			add_location(div98, file$5, 350, 28, 26478);
    			attr_dev(aside2, "class", " col-12 col-md-3 mt-3 ");
    			add_location(aside2, file$5, 338, 24, 25768);
    			attr_dev(div99, "class", "row px-0 mx-0");
    			add_location(div99, file$5, 147, 20, 7927);
    			attr_dev(div100, "id", "post");
    			attr_dev(div100, "class", "row tab-pane");
    			toggle_class(div100, "active", /*current*/ ctx[3] === "post");
    			add_location(div100, file$5, 146, 16, 7836);
    			attr_dev(h58, "class", "text-bold mb-2");
    			add_location(h58, file$5, 502, 32, 40120);
    			attr_dev(p11, "class", "text-secondary text-justify word-space");
    			add_location(p11, file$5, 503, 32, 40198);
    			attr_dev(div101, "class", "col-6 text-bold pr-0");
    			add_location(div101, file$5, 510, 40, 40925);
    			attr_dev(a42, "class", "text-primary");
    			attr_dev(a42, "href", "#");
    			add_location(a42, file$5, 512, 44, 41096);
    			attr_dev(div102, "class", "col-6 text-bold pr-0 mb-4");
    			add_location(div102, file$5, 511, 40, 41012);
    			attr_dev(div103, "class", "col-6 text-bold pr-0");
    			add_location(div103, file$5, 516, 40, 41334);
    			attr_dev(div104, "class", "col-6 pr-0 mb-4 text-secondary");
    			add_location(div104, file$5, 517, 40, 41425);
    			attr_dev(div105, "class", "col-6 text-bold pr-0");
    			add_location(div105, file$5, 520, 40, 41631);
    			attr_dev(div106, "class", "col-6 pr-0 mb-4 text-secondary");
    			add_location(div106, file$5, 521, 40, 41725);
    			attr_dev(div107, "class", "col-6 text-bold pr-0");
    			add_location(div107, file$5, 524, 40, 41914);
    			attr_dev(div108, "class", "col-6 pr-0 mb-4 text-secondary");
    			add_location(div108, file$5, 525, 40, 42006);
    			attr_dev(div109, "class", "col-6 text-bold pr-0");
    			add_location(div109, file$5, 528, 40, 42187);
    			attr_dev(div110, "class", "col-6 pr-0 mb-4 text-secondary");
    			add_location(div110, file$5, 529, 40, 42275);
    			attr_dev(div111, "class", "col-6 text-bold pr-0");
    			add_location(div111, file$5, 532, 40, 42478);
    			attr_dev(div112, "class", "col-6 pr-0 mb-4 text-secondary");
    			add_location(div112, file$5, 533, 40, 42568);
    			attr_dev(div113, "class", "row ");
    			add_location(div113, file$5, 509, 36, 40866);
    			attr_dev(div114, "class", "col-12");
    			add_location(div114, file$5, 508, 32, 40809);
    			attr_dev(div115, "class", "col-12 ");
    			add_location(div115, file$5, 501, 28, 40066);
    			attr_dev(div116, "class", "row bg-white shadow-radius-section ml-1 py-4 px-1");
    			add_location(div116, file$5, 500, 24, 39974);
    			attr_dev(h59, "class", "text-bold ");
    			add_location(h59, file$5, 542, 32, 43059);
    			attr_dev(p12, "class", "text-secondary text-justify word-space");
    			add_location(p12, file$5, 543, 32, 43139);
    			attr_dev(div117, "class", "row");
    			add_location(div117, file$5, 546, 32, 43330);
    			attr_dev(div118, "class", "col-12 ");
    			add_location(div118, file$5, 541, 28, 43005);
    			attr_dev(div119, "class", "row bg-white shadow-radius-section ml-1 py-4 px-1 mt-3");
    			add_location(div119, file$5, 540, 24, 42908);
    			attr_dev(div120, "class", "col-12 direction ");
    			add_location(div120, file$5, 499, 20, 39918);
    			attr_dev(div121, "id", "about");
    			attr_dev(div121, "class", "row tab-pane mt-3 margin-about-right");
    			toggle_class(div121, "active", /*current*/ ctx[3] === "about");
    			add_location(div121, file$5, 498, 16, 39801);
    			attr_dev(div122, "class", "tab-content w-100 mr-0");
    			add_location(div122, file$5, 145, 12, 7783);
    			attr_dev(aside3, "class", "col-12 col-lg-8  ");
    			add_location(aside3, file$5, 100, 8, 4251);
    			attr_dev(div123, "class", "row justify-content-center mx-0");
    			add_location(div123, file$5, 85, 4, 3650);
    			attr_dev(main, "class", "container-fluid pin-parent px-0 px-md-3");
    			add_location(main, file$5, 84, 0, 3574);
    			add_location(br0, file$5, 559, 0, 43613);
    			add_location(br1, file$5, 559, 4, 43617);
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, div123);
    			append_dev(div123, aside0);
    			append_dev(aside0, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, a0);
    			append_dev(a0, img0);
    			append_dev(div123, t1);
    			append_dev(div123, aside3);
    			append_dev(aside3, div16);
    			append_dev(div16, div15);
    			append_dev(div15, div14);
    			append_dev(div14, div4);
    			append_dev(div4, img1);
    			append_dev(div14, t2);
    			append_dev(div14, div5);
    			append_dev(div5, img2);
    			append_dev(div14, t3);
    			append_dev(div14, div11);
    			append_dev(div11, div10);
    			append_dev(div10, div9);
    			append_dev(div9, h30);
    			append_dev(h30, t4);
    			append_dev(h30, i0);
    			append_dev(div9, t5);
    			append_dev(div9, h60);
    			append_dev(h60, i1);
    			append_dev(h60, t6);
    			append_dev(div9, t7);
    			append_dev(div9, h61);
    			append_dev(div9, t9);
    			append_dev(div9, div8);
    			append_dev(div8, div7);
    			append_dev(div7, button0);
    			append_dev(button0, i2);
    			append_dev(button0, t10);
    			append_dev(div7, t11);
    			append_dev(div7, div6);
    			append_dev(div6, button1);
    			append_dev(div6, t13);
    			append_dev(div6, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a1);
    			append_dev(a1, i3);
    			append_dev(a1, t14);
    			append_dev(ul0, t15);
    			append_dev(ul0, li1);
    			append_dev(li1, a2);
    			append_dev(a2, i4);
    			append_dev(a2, t16);
    			append_dev(div14, t17);
    			append_dev(div14, div13);
    			append_dev(div13, div12);
    			append_dev(div12, ul1);
    			append_dev(ul1, li2);
    			append_dev(li2, a3);
    			append_dev(ul1, t19);
    			append_dev(ul1, li3);
    			append_dev(li3, a4);
    			append_dev(aside3, t21);
    			append_dev(aside3, div122);
    			append_dev(div122, div100);
    			append_dev(div100, div99);
    			append_dev(div99, aside1);
    			append_dev(aside1, section);
    			append_dev(section, div56);
    			append_dev(div56, article0);
    			append_dev(article0, div24);
    			append_dev(div24, div23);
    			append_dev(div23, div21);
    			append_dev(div21, div20);
    			append_dev(div20, div17);
    			append_dev(div17, img3);
    			append_dev(div20, t22);
    			append_dev(div20, div19);
    			append_dev(div19, div18);
    			append_dev(div18, h62);
    			append_dev(h62, a5);
    			append_dev(a5, t23);
    			append_dev(a5, i5);
    			append_dev(div18, t24);
    			append_dev(div18, span0);
    			append_dev(span0, i6);
    			append_dev(span0, t25);
    			append_dev(div23, t26);
    			append_dev(div23, div22);
    			append_dev(div22, i7);
    			append_dev(div22, t27);
    			append_dev(div22, ul2);
    			append_dev(ul2, li4);
    			append_dev(li4, a6);
    			append_dev(a6, i8);
    			append_dev(a6, t28);
    			append_dev(ul2, t29);
    			append_dev(ul2, li5);
    			append_dev(li5, a7);
    			append_dev(a7, i9);
    			append_dev(a7, t30);
    			append_dev(ul2, t31);
    			append_dev(ul2, li6);
    			append_dev(li6, a8);
    			append_dev(a8, i10);
    			append_dev(a8, t32);
    			append_dev(article0, t33);
    			append_dev(article0, div25);
    			append_dev(div25, h31);
    			append_dev(h31, a9);
    			append_dev(article0, t35);
    			append_dev(article0, div26);
    			append_dev(div26, img4);
    			append_dev(article0, t36);
    			append_dev(article0, p0);
    			append_dev(p0, t37);
    			append_dev(p0, span1);
    			append_dev(p0, span2);
    			append_dev(p0, t40);
    			append_dev(p0, span3);
    			append_dev(article0, t42);
    			append_dev(article0, div27);
    			append_dev(div27, a10);
    			append_dev(a10, button2);
    			append_dev(article0, t44);
    			append_dev(article0, div29);
    			append_dev(div29, a11);
    			append_dev(a11, img5);
    			append_dev(a11, t45);
    			append_dev(a11, span4);
    			append_dev(a11, t47);
    			append_dev(div29, t48);
    			append_dev(div29, div28);
    			append_dev(div28, i11);
    			append_dev(div28, t49);
    			append_dev(div56, t50);
    			append_dev(div56, article1);
    			append_dev(article1, div37);
    			append_dev(div37, div36);
    			append_dev(div36, div34);
    			append_dev(div34, div33);
    			append_dev(div33, div30);
    			append_dev(div30, img6);
    			append_dev(div33, t51);
    			append_dev(div33, div32);
    			append_dev(div32, div31);
    			append_dev(div31, h63);
    			append_dev(h63, a12);
    			append_dev(a12, t52);
    			append_dev(a12, i12);
    			append_dev(div31, t53);
    			append_dev(div31, span5);
    			append_dev(span5, i13);
    			append_dev(span5, t54);
    			append_dev(div36, t55);
    			append_dev(div36, div35);
    			append_dev(div35, i14);
    			append_dev(div35, t56);
    			append_dev(div35, ul3);
    			append_dev(ul3, li7);
    			append_dev(li7, a13);
    			append_dev(a13, i15);
    			append_dev(a13, t57);
    			append_dev(ul3, t58);
    			append_dev(ul3, li8);
    			append_dev(li8, a14);
    			append_dev(a14, i16);
    			append_dev(a14, t59);
    			append_dev(ul3, t60);
    			append_dev(ul3, li9);
    			append_dev(li9, a15);
    			append_dev(a15, i17);
    			append_dev(a15, t61);
    			append_dev(article1, t62);
    			append_dev(article1, div38);
    			append_dev(div38, h32);
    			append_dev(h32, a16);
    			append_dev(article1, t64);
    			append_dev(article1, div39);
    			append_dev(div39, img7);
    			append_dev(article1, t65);
    			append_dev(article1, p1);
    			append_dev(p1, t66);
    			append_dev(p1, span6);
    			append_dev(p1, span7);
    			append_dev(p1, t69);
    			append_dev(p1, span8);
    			append_dev(article1, t71);
    			append_dev(article1, div40);
    			append_dev(div40, a17);
    			append_dev(a17, button3);
    			append_dev(article1, t73);
    			append_dev(article1, div42);
    			append_dev(div42, a18);
    			append_dev(a18, img8);
    			append_dev(a18, t74);
    			append_dev(a18, span9);
    			append_dev(a18, t76);
    			append_dev(div42, t77);
    			append_dev(div42, div41);
    			append_dev(div41, i18);
    			append_dev(div41, t78);
    			append_dev(div56, t79);
    			append_dev(div56, article2);
    			append_dev(article2, div50);
    			append_dev(div50, div49);
    			append_dev(div49, div47);
    			append_dev(div47, div46);
    			append_dev(div46, div43);
    			append_dev(div43, img9);
    			append_dev(div46, t80);
    			append_dev(div46, div45);
    			append_dev(div45, div44);
    			append_dev(div44, h64);
    			append_dev(h64, a19);
    			append_dev(a19, t81);
    			append_dev(a19, i19);
    			append_dev(div44, t82);
    			append_dev(div44, span10);
    			append_dev(span10, i20);
    			append_dev(span10, t83);
    			append_dev(div49, t84);
    			append_dev(div49, div48);
    			append_dev(div48, i21);
    			append_dev(div48, t85);
    			append_dev(div48, ul4);
    			append_dev(ul4, li10);
    			append_dev(li10, a20);
    			append_dev(a20, i22);
    			append_dev(a20, t86);
    			append_dev(ul4, t87);
    			append_dev(ul4, li11);
    			append_dev(li11, a21);
    			append_dev(a21, i23);
    			append_dev(a21, t88);
    			append_dev(ul4, t89);
    			append_dev(ul4, li12);
    			append_dev(li12, a22);
    			append_dev(a22, i24);
    			append_dev(a22, t90);
    			append_dev(article2, t91);
    			append_dev(article2, div51);
    			append_dev(div51, h33);
    			append_dev(h33, a23);
    			append_dev(article2, t93);
    			append_dev(article2, div52);
    			append_dev(div52, img10);
    			append_dev(article2, t94);
    			append_dev(article2, p2);
    			append_dev(p2, t95);
    			append_dev(p2, span11);
    			append_dev(p2, span12);
    			append_dev(p2, t98);
    			append_dev(p2, span13);
    			append_dev(article2, t100);
    			append_dev(article2, div53);
    			append_dev(div53, a24);
    			append_dev(a24, button4);
    			append_dev(article2, t102);
    			append_dev(article2, div55);
    			append_dev(div55, a25);
    			append_dev(a25, img11);
    			append_dev(a25, t103);
    			append_dev(a25, span14);
    			append_dev(a25, t105);
    			append_dev(div55, t106);
    			append_dev(div55, div54);
    			append_dev(div54, i25);
    			append_dev(div54, t107);
    			append_dev(div99, t108);
    			append_dev(div99, aside2);
    			append_dev(aside2, div58);
    			append_dev(div58, div57);
    			append_dev(div57, img12);
    			append_dev(div58, t109);
    			append_dev(div58, h34);
    			append_dev(div58, t111);
    			append_dev(div58, h65);
    			append_dev(aside2, t113);
    			append_dev(aside2, div98);
    			append_dev(div98, div59);
    			append_dev(div59, a26);
    			append_dev(a26, i26);
    			append_dev(a26, t114);
    			append_dev(div59, span15);
    			append_dev(div98, t116);
    			append_dev(div98, div97);
    			append_dev(div97, div96);
    			if (if_block1) if_block1.m(div96, null);
    			append_dev(div96, t117);
    			append_dev(div96, div87);
    			append_dev(div87, div60);
    			append_dev(div60, h50);
    			append_dev(h50, a27);
    			append_dev(h50, t118);
    			append_dev(h50, a28);
    			append_dev(a28, p3);
    			append_dev(div87, t120);
    			append_dev(div87, div86);
    			append_dev(div86, div85);
    			append_dev(div85, div84);
    			append_dev(div84, div83);
    			append_dev(div83, div64);
    			append_dev(div64, div61);
    			append_dev(div61, h51);
    			append_dev(h51, a29);
    			append_dev(h51, t121);
    			append_dev(h51, a30);
    			append_dev(a30, p4);
    			append_dev(div64, t123);
    			append_dev(div64, div63);
    			append_dev(div63, div62);
    			append_dev(div83, t125);
    			append_dev(div83, div68);
    			append_dev(div68, div65);
    			append_dev(div65, h52);
    			append_dev(h52, a31);
    			append_dev(h52, t126);
    			append_dev(h52, a32);
    			append_dev(a32, p5);
    			append_dev(div68, t128);
    			append_dev(div68, div67);
    			append_dev(div67, div66);
    			append_dev(div83, t130);
    			append_dev(div83, div82);
    			append_dev(div82, div69);
    			append_dev(div69, h53);
    			append_dev(h53, a33);
    			append_dev(h53, t131);
    			append_dev(h53, a34);
    			append_dev(a34, p6);
    			append_dev(div82, t133);
    			append_dev(div82, div81);
    			append_dev(div81, div80);
    			append_dev(div80, div79);
    			append_dev(div79, div78);
    			append_dev(div78, div73);
    			append_dev(div73, div70);
    			append_dev(div70, h54);
    			append_dev(h54, a35);
    			append_dev(h54, t134);
    			append_dev(h54, a36);
    			append_dev(a36, p7);
    			append_dev(div73, t136);
    			append_dev(div73, div72);
    			append_dev(div72, div71);
    			append_dev(div78, t138);
    			append_dev(div78, div77);
    			append_dev(div77, div74);
    			append_dev(div74, h55);
    			append_dev(h55, a37);
    			append_dev(a37, p8);
    			append_dev(div77, t140);
    			append_dev(div77, div76);
    			append_dev(div76, div75);
    			append_dev(div96, t142);
    			append_dev(div96, div91);
    			append_dev(div91, div88);
    			append_dev(div88, h56);
    			append_dev(h56, a38);
    			append_dev(h56, t143);
    			append_dev(h56, a39);
    			append_dev(a39, p9);
    			append_dev(div91, t145);
    			append_dev(div91, div90);
    			append_dev(div90, div89);
    			append_dev(div96, t147);
    			append_dev(div96, div95);
    			append_dev(div95, div92);
    			append_dev(div92, h57);
    			append_dev(h57, a40);
    			append_dev(h57, t148);
    			append_dev(h57, a41);
    			append_dev(a41, p10);
    			append_dev(div95, t150);
    			append_dev(div95, div94);
    			append_dev(div94, div93);
    			append_dev(div122, t152);
    			append_dev(div122, div121);
    			append_dev(div121, div120);
    			append_dev(div120, div116);
    			append_dev(div116, div115);
    			append_dev(div115, h58);
    			append_dev(div115, t154);
    			append_dev(div115, p11);
    			append_dev(div115, t156);
    			append_dev(div115, div114);
    			append_dev(div114, div113);
    			append_dev(div113, div101);
    			append_dev(div113, t158);
    			append_dev(div113, div102);
    			append_dev(div102, a42);
    			append_dev(div113, t160);
    			append_dev(div113, div103);
    			append_dev(div113, t162);
    			append_dev(div113, div104);
    			append_dev(div113, t164);
    			append_dev(div113, div105);
    			append_dev(div113, t166);
    			append_dev(div113, div106);
    			append_dev(div113, t168);
    			append_dev(div113, div107);
    			append_dev(div113, t170);
    			append_dev(div113, div108);
    			append_dev(div113, t172);
    			append_dev(div113, div109);
    			append_dev(div113, t174);
    			append_dev(div113, div110);
    			append_dev(div113, t176);
    			append_dev(div113, div111);
    			append_dev(div113, t178);
    			append_dev(div113, div112);
    			append_dev(div120, t180);
    			append_dev(div120, div119);
    			append_dev(div119, div118);
    			append_dev(div118, h59);
    			append_dev(div118, t182);
    			append_dev(div118, p12);
    			append_dev(div118, t184);
    			append_dev(div118, div117);
    			insert_dev(target, t185, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, br1, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(a3, "click", /*click_handler_2*/ ctx[8], false, false, false),
    					listen_dev(a4, "click", /*click_handler_3*/ ctx[9], false, false, false),
    					listen_dev(span3, "click", myFunction, false, false, false),
    					listen_dev(span8, "click", myFunction, false, false, false),
    					listen_dev(span13, "click", myFunction, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*y*/ ctx[1] > 600) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*y*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a3, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(a4, "active", /*current*/ ctx[3] === "about");
    			}

    			if (dirty & /*x*/ 1) {
    				toggle_class(div58, "d-none", /*x*/ ctx[0] <= 767);
    			}

    			if (!current || dirty & /*x*/ 1 && i26_class_value !== (i26_class_value = "" + ((/*x*/ ctx[0] >= 767
    			? "fas fa-list-ul category-icon-modal"
    			: "fas fa-caret-left") + " "))) {
    				attr_dev(i26, "class", i26_class_value);
    			}

    			if (dirty & /*x, x, y*/ 3) {
    				toggle_class(i26, "category-fixed-icon-modal", /*x*/ ctx[0] <= 767 && /*y*/ ctx[1] >= 400);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_type_value !== (a26_type_value = /*x*/ ctx[0] <= 767 ? "button" : "")) {
    				attr_dev(a26, "type", a26_type_value);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_data_toggle_value !== (a26_data_toggle_value = /*x*/ ctx[0] <= 767 ? "modal" : "")) {
    				attr_dev(a26, "data-toggle", a26_data_toggle_value);
    			}

    			if (!current || dirty & /*x*/ 1 && a26_data_target_value !== (a26_data_target_value = /*x*/ ctx[0] <= 767 ? "#myModal2" : "")) {
    				attr_dev(a26, "data-target", a26_data_target_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div59_class_value !== (div59_class_value = /*x*/ ctx[0] >= 767
    			? "col-12 font-weight-bold pb-2 border-bottom pr-0"
    			: "col-12 font-weight-bold")) {
    				attr_dev(div59, "class", div59_class_value);
    			}

    			if (/*x*/ ctx[0] <= 767) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(div96, t117);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!current || dirty & /*x*/ 1 && div96_class_value !== (div96_class_value = /*x*/ ctx[0] <= 767
    			? "modal-dialog modal-content pr-2"
    			: "")) {
    				attr_dev(div96, "class", div96_class_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div96_role_value !== (div96_role_value = /*x*/ ctx[0] <= 767 ? "document" : "")) {
    				attr_dev(div96, "role", div96_role_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_class_value !== (div97_class_value = "" + ((/*x*/ ctx[0] <= 767 ? "modal right" : "") + " mt-2 mr-1 col-12 p-0 d-lg-inline"))) {
    				attr_dev(div97, "class", div97_class_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_id_value !== (div97_id_value = /*x*/ ctx[0] <= 767 ? "myModal2" : "")) {
    				attr_dev(div97, "id", div97_id_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_tabindex_value !== (div97_tabindex_value = /*x*/ ctx[0] <= 767 ? "-1" : "")) {
    				attr_dev(div97, "tabindex", div97_tabindex_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div97_role_value !== (div97_role_value = /*x*/ ctx[0] <= 767 ? "dialog" : "")) {
    				attr_dev(div97, "role", div97_role_value);
    			}

    			if (!current || dirty & /*x*/ 1 && div98_class_value !== (div98_class_value = /*x*/ ctx[0] >= 767
    			? "row direction shadow-radius-section mt-4 py-2 bg-white"
    			: "row direction ")) {
    				attr_dev(div98, "class", div98_class_value);
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(div100, "active", /*current*/ ctx[3] === "post");
    			}

    			if (dirty & /*current*/ 8) {
    				toggle_class(div121, "active", /*current*/ ctx[3] === "about");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);

    			add_render_callback(() => {
    				if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, true);
    				main_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, false);
    			main_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (if_block1) if_block1.d();
    			if (detaching && main_transition) main_transition.end();
    			if (detaching) detach_dev(t185);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(br1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(38:0) <Router url=\\\"{url}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let t;
    	let router;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[4]);
    	add_render_callback(/*onwindowresize*/ ctx[5]);

    	router = new Router({
    			props: {
    				url: /*url*/ ctx[2],
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			t = space();
    			create_component(router.$$.fragment);
    			document.title = "\n        اینولینکس\n    ";
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    			mount_component(router, target, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1$1, "scroll", () => {
    						scrolling = true;
    						clearTimeout(scrolling_timeout);
    						scrolling_timeout = setTimeout(clear_scrolling, 100);
    						/*onwindowscroll*/ ctx[4]();
    					}),
    					listen_dev(window_1$1, "resize", /*onwindowresize*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 2 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1$1.pageXOffset, /*y*/ ctx[1]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			const router_changes = {};
    			if (dirty & /*url*/ 4) router_changes.url = /*url*/ ctx[2];

    			if (dirty & /*$$scope, current, x, y*/ 262155) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    			destroy_component(router, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Magezine", slots, []);
    	let { url = "" } = $$props;
    	let { y } = $$props;
    	let { x } = $$props;
    	const urlParams = new URLSearchParams(window.location.search);
    	const id = urlParams.has("id");
    	console.log(id);
    	let isOpen = false;
    	let current = "post";

    	function toggleNav() {
    		isOpen = !isOpen;
    	}

    	//let y=0;
    	var currentLocation = window.location.href;

    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];

    	// $ : console.log(lastSugment);
    	let map;

    	const writable_props = ["url", "y", "x"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$1.warn(`<Magezine> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(1, y = window_1$1.pageYOffset);
    	}

    	function onwindowresize() {
    		$$invalidate(0, x = window_1$1.innerWidth);
    	}

    	const click_handler = () => $$invalidate(3, current = "post");
    	const click_handler_1 = () => $$invalidate(3, current = "about");
    	const click_handler_2 = () => $$invalidate(3, current = "post");
    	const click_handler_3 = () => $$invalidate(3, current = "about");

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(2, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		fade,
    		slide,
    		scale,
    		fly,
    		Loader,
    		Router,
    		Link,
    		Route,
    		circIn,
    		showDetail: Show_detail,
    		profile: Profile,
    		url,
    		y,
    		x,
    		urlParams,
    		id,
    		isOpen,
    		current,
    		toggleNav,
    		currentLocation,
    		splitUrl,
    		lastSugment,
    		map
    	});

    	$$self.$inject_state = $$props => {
    		if ("url" in $$props) $$invalidate(2, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    		if ("isOpen" in $$props) isOpen = $$props.isOpen;
    		if ("current" in $$props) $$invalidate(3, current = $$props.current);
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) lastSugment = $$props.lastSugment;
    		if ("map" in $$props) map = $$props.map;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*x*/ 1) {
    			console.log(x);
    		}
    	};

    	return [
    		x,
    		y,
    		url,
    		current,
    		onwindowscroll,
    		onwindowresize,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class Magezine extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { url: 2, y: 1, x: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Magezine",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[1] === undefined && !("y" in props)) {
    			console_1$1.warn("<Magezine> was created without expected prop 'y'");
    		}

    		if (/*x*/ ctx[0] === undefined && !("x" in props)) {
    			console_1$1.warn("<Magezine> was created without expected prop 'x'");
    		}
    	}

    	get url() {
    		throw new Error("<Magezine>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Magezine>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Magezine>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Magezine>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get x() {
    		throw new Error("<Magezine>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<Magezine>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/pages/home.svelte generated by Svelte v3.38.3 */

    const { window: window_1 } = globals;
    const file$4 = "src/pages/home.svelte";

    function create_fragment$4(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let t0;
    	let main;
    	let div46;
    	let aside0;
    	let t2;
    	let aside1;
    	let section0;
    	let div1;
    	let article0;
    	let img0;
    	let img0_src_value;
    	let t3;
    	let a0;
    	let h50;
    	let t5;
    	let a1;
    	let img1;
    	let img1_src_value;
    	let t6;
    	let div0;
    	let span0;
    	let t7;
    	let i0;
    	let t8;
    	let i1;
    	let t9;
    	let t10;
    	let div3;
    	let article1;
    	let img2;
    	let img2_src_value;
    	let t11;
    	let a2;
    	let h51;
    	let t13;
    	let a3;
    	let img3;
    	let img3_src_value;
    	let t14;
    	let div2;
    	let span1;
    	let t15;
    	let i2;
    	let t16;
    	let i3;
    	let t17;
    	let t18;
    	let div5;
    	let article2;
    	let img4;
    	let img4_src_value;
    	let t19;
    	let a4;
    	let h52;
    	let t21;
    	let a5;
    	let img5;
    	let img5_src_value;
    	let t22;
    	let div4;
    	let span2;
    	let t23;
    	let i4;
    	let t24;
    	let i5;
    	let t25;
    	let t26;
    	let section1;
    	let div45;
    	let article3;
    	let div13;
    	let div12;
    	let div10;
    	let div9;
    	let div6;
    	let img6;
    	let img6_src_value;
    	let t27;
    	let div8;
    	let div7;
    	let h60;
    	let a6;
    	let t28;
    	let i6;
    	let t29;
    	let span3;
    	let i7;
    	let t30;
    	let t31;
    	let div11;
    	let i8;
    	let t32;
    	let ul0;
    	let li0;
    	let a7;
    	let i9;
    	let t33;
    	let t34;
    	let li1;
    	let a8;
    	let i10;
    	let t35;
    	let t36;
    	let li2;
    	let a9;
    	let i11;
    	let t37;
    	let t38;
    	let div14;
    	let h30;
    	let a10;
    	let t40;
    	let div15;
    	let img7;
    	let img7_src_value;
    	let t41;
    	let p0;
    	let t42;
    	let span4;
    	let span5;
    	let t45;
    	let span6;
    	let t47;
    	let div16;
    	let a11;
    	let button0;
    	let t49;
    	let div18;
    	let a12;
    	let img8;
    	let img8_src_value;
    	let t50;
    	let span7;
    	let t52;
    	let t53;
    	let div17;
    	let i12;
    	let t54;
    	let t55;
    	let article4;
    	let div26;
    	let div25;
    	let div23;
    	let div22;
    	let div19;
    	let img9;
    	let img9_src_value;
    	let t56;
    	let div21;
    	let div20;
    	let h61;
    	let a13;
    	let t57;
    	let i13;
    	let t58;
    	let span8;
    	let i14;
    	let t59;
    	let t60;
    	let div24;
    	let i15;
    	let t61;
    	let ul1;
    	let li3;
    	let a14;
    	let i16;
    	let t62;
    	let t63;
    	let li4;
    	let a15;
    	let i17;
    	let t64;
    	let t65;
    	let li5;
    	let a16;
    	let i18;
    	let t66;
    	let t67;
    	let div27;
    	let h31;
    	let a17;
    	let t69;
    	let div28;
    	let img10;
    	let img10_src_value;
    	let t70;
    	let p1;
    	let t71;
    	let span9;
    	let span10;
    	let t74;
    	let span11;
    	let t76;
    	let div29;
    	let a18;
    	let button1;
    	let t78;
    	let div31;
    	let a19;
    	let img11;
    	let img11_src_value;
    	let t79;
    	let span12;
    	let t81;
    	let t82;
    	let div30;
    	let i19;
    	let t83;
    	let t84;
    	let article5;
    	let div39;
    	let div38;
    	let div36;
    	let div35;
    	let div32;
    	let img12;
    	let img12_src_value;
    	let t85;
    	let div34;
    	let div33;
    	let h62;
    	let a20;
    	let t86;
    	let i20;
    	let t87;
    	let span13;
    	let i21;
    	let t88;
    	let t89;
    	let div37;
    	let i22;
    	let t90;
    	let ul2;
    	let li6;
    	let a21;
    	let i23;
    	let t91;
    	let t92;
    	let li7;
    	let a22;
    	let i24;
    	let t93;
    	let t94;
    	let li8;
    	let a23;
    	let i25;
    	let t95;
    	let t96;
    	let div40;
    	let h32;
    	let a24;
    	let t98;
    	let div41;
    	let img13;
    	let img13_src_value;
    	let t99;
    	let p2;
    	let t100;
    	let span14;
    	let span15;
    	let t103;
    	let span16;
    	let t105;
    	let div42;
    	let a25;
    	let button2;
    	let t107;
    	let div44;
    	let a26;
    	let img14;
    	let img14_src_value;
    	let t108;
    	let span17;
    	let t110;
    	let t111;
    	let div43;
    	let i26;
    	let t112;
    	let t113;
    	let aside2;
    	let main_transition;
    	let t115;
    	let br0;
    	let hr;
    	let br1;
    	let br2;
    	let br3;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[6]);
    	add_render_callback(/*onwindowresize*/ ctx[7]);

    	const block = {
    		c: function create() {
    			t0 = space();
    			main = element("main");
    			div46 = element("div");
    			aside0 = element("aside");
    			aside0.textContent = "hello";
    			t2 = space();
    			aside1 = element("aside");
    			section0 = element("section");
    			div1 = element("div");
    			article0 = element("article");
    			img0 = element("img");
    			t3 = space();
    			a0 = element("a");
    			h50 = element("h5");
    			h50.textContent = "جدیدترین اخبار از تحریم فیس بوک توسط آمریکا";
    			t5 = space();
    			a1 = element("a");
    			img1 = element("img");
    			t6 = space();
    			div0 = element("div");
    			span0 = element("span");
    			t7 = text("برنامه تلویزیونی جهان آرا ");
    			i0 = element("i");
    			t8 = text("    ");
    			i1 = element("i");
    			t9 = text(" ۲ ماه قبل");
    			t10 = space();
    			div3 = element("div");
    			article1 = element("article");
    			img2 = element("img");
    			t11 = space();
    			a2 = element("a");
    			h51 = element("h5");
    			h51.textContent = "جدیدترین اخبار از تحریم فیس بوک توسط آمریکا";
    			t13 = space();
    			a3 = element("a");
    			img3 = element("img");
    			t14 = space();
    			div2 = element("div");
    			span1 = element("span");
    			t15 = text("فیس بوک ");
    			i2 = element("i");
    			t16 = text("    ");
    			i3 = element("i");
    			t17 = text(" ۲ ماه قبل");
    			t18 = space();
    			div5 = element("div");
    			article2 = element("article");
    			img4 = element("img");
    			t19 = space();
    			a4 = element("a");
    			h52 = element("h5");
    			h52.textContent = "به اینولینکس خوش آمدید";
    			t21 = space();
    			a5 = element("a");
    			img5 = element("img");
    			t22 = space();
    			div4 = element("div");
    			span2 = element("span");
    			t23 = text("خبرگذاری تسنیم ");
    			i4 = element("i");
    			t24 = text("    ");
    			i5 = element("i");
    			t25 = text(" ۲ ماه قبل");
    			t26 = space();
    			section1 = element("section");
    			div45 = element("div");
    			article3 = element("article");
    			div13 = element("div");
    			div12 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			div6 = element("div");
    			img6 = element("img");
    			t27 = space();
    			div8 = element("div");
    			div7 = element("div");
    			h60 = element("h6");
    			a6 = element("a");
    			t28 = text("مرکز رشد و نواوری آفرینه ");
    			i6 = element("i");
    			t29 = space();
    			span3 = element("span");
    			i7 = element("i");
    			t30 = text(" ۳ دقیقه قبل");
    			t31 = space();
    			div11 = element("div");
    			i8 = element("i");
    			t32 = space();
    			ul0 = element("ul");
    			li0 = element("li");
    			a7 = element("a");
    			i9 = element("i");
    			t33 = text(" ذخیره کردن پست");
    			t34 = space();
    			li1 = element("li");
    			a8 = element("a");
    			i10 = element("i");
    			t35 = text(" کپی کردن لینک");
    			t36 = space();
    			li2 = element("li");
    			a9 = element("a");
    			i11 = element("i");
    			t37 = text(" گزارش دادن");
    			t38 = space();
    			div14 = element("div");
    			h30 = element("h3");
    			a10 = element("a");
    			a10.textContent = "به اینولینکس خوش آمدید";
    			t40 = space();
    			div15 = element("div");
    			img7 = element("img");
    			t41 = space();
    			p0 = element("p");
    			t42 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span4 = element("span");
    			span4.textContent = "...";
    			span5 = element("span");
    			span5.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                            برای پر کردن صفحه و ارایه اولیه شکل \n                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t45 = space();
    			span6 = element("span");
    			span6.textContent = "بیشتر بخوانید";
    			t47 = space();
    			div16 = element("div");
    			a11 = element("a");
    			button0 = element("button");
    			button0.textContent = "ادامه مطلب";
    			t49 = space();
    			div18 = element("div");
    			a12 = element("a");
    			img8 = element("img");
    			t50 = space();
    			span7 = element("span");
    			span7.textContent = "مسعودآقایی ساداتی";
    			t52 = text("  ");
    			t53 = space();
    			div17 = element("div");
    			i12 = element("i");
    			t54 = text(" ۵۶");
    			t55 = space();
    			article4 = element("article");
    			div26 = element("div");
    			div25 = element("div");
    			div23 = element("div");
    			div22 = element("div");
    			div19 = element("div");
    			img9 = element("img");
    			t56 = space();
    			div21 = element("div");
    			div20 = element("div");
    			h61 = element("h6");
    			a13 = element("a");
    			t57 = text("مرکز رشد و نواوری آفرینه ");
    			i13 = element("i");
    			t58 = space();
    			span8 = element("span");
    			i14 = element("i");
    			t59 = text(" ۳ دقیقه قبل");
    			t60 = space();
    			div24 = element("div");
    			i15 = element("i");
    			t61 = space();
    			ul1 = element("ul");
    			li3 = element("li");
    			a14 = element("a");
    			i16 = element("i");
    			t62 = text(" ذخیره کردن پست");
    			t63 = space();
    			li4 = element("li");
    			a15 = element("a");
    			i17 = element("i");
    			t64 = text(" کپی کردن لینک");
    			t65 = space();
    			li5 = element("li");
    			a16 = element("a");
    			i18 = element("i");
    			t66 = text(" گزارش دادن");
    			t67 = space();
    			div27 = element("div");
    			h31 = element("h3");
    			a17 = element("a");
    			a17.textContent = "به اینولینکس خوش آمدید";
    			t69 = space();
    			div28 = element("div");
    			img10 = element("img");
    			t70 = space();
    			p1 = element("p");
    			t71 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span9 = element("span");
    			span9.textContent = "...";
    			span10 = element("span");
    			span10.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                            برای پر کردن صفحه و ارایه اولیه شکل \n                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t74 = space();
    			span11 = element("span");
    			span11.textContent = "بیشتر بخوانید";
    			t76 = space();
    			div29 = element("div");
    			a18 = element("a");
    			button1 = element("button");
    			button1.textContent = "ادامه مطلب";
    			t78 = space();
    			div31 = element("div");
    			a19 = element("a");
    			img11 = element("img");
    			t79 = space();
    			span12 = element("span");
    			span12.textContent = "مسعودآقایی ساداتی";
    			t81 = text("  ");
    			t82 = space();
    			div30 = element("div");
    			i19 = element("i");
    			t83 = text(" ۵۶");
    			t84 = space();
    			article5 = element("article");
    			div39 = element("div");
    			div38 = element("div");
    			div36 = element("div");
    			div35 = element("div");
    			div32 = element("div");
    			img12 = element("img");
    			t85 = space();
    			div34 = element("div");
    			div33 = element("div");
    			h62 = element("h6");
    			a20 = element("a");
    			t86 = text("مرکز رشد و نواوری آفرینه ");
    			i20 = element("i");
    			t87 = space();
    			span13 = element("span");
    			i21 = element("i");
    			t88 = text(" ۳ دقیقه قبل");
    			t89 = space();
    			div37 = element("div");
    			i22 = element("i");
    			t90 = space();
    			ul2 = element("ul");
    			li6 = element("li");
    			a21 = element("a");
    			i23 = element("i");
    			t91 = text(" ذخیره کردن پست");
    			t92 = space();
    			li7 = element("li");
    			a22 = element("a");
    			i24 = element("i");
    			t93 = text(" کپی کردن لینک");
    			t94 = space();
    			li8 = element("li");
    			a23 = element("a");
    			i25 = element("i");
    			t95 = text(" گزارش دادن");
    			t96 = space();
    			div40 = element("div");
    			h32 = element("h3");
    			a24 = element("a");
    			a24.textContent = "به اینولینکس خوش آمدید";
    			t98 = space();
    			div41 = element("div");
    			img13 = element("img");
    			t99 = space();
    			p2 = element("p");
    			t100 = text("طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                             صفحه‌آرایی و طراحی گرافیک گفته می‌شود. طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                             برای پر کردن صفحه و ارایه اولیه شکل ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید ");
    			span14 = element("span");
    			span14.textContent = "...";
    			span15 = element("span");
    			span15.textContent = "طراح گرافیک از این متن به عنوان عنصری از ترکیب بندی \n                            برای پر کردن صفحه و ارایه اولیه شکل \n                            ظاهری و کلی طرح سفارش گرفته شده استفاده می نماید،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد. طرح‌نما یا لورم ایپسوم(به انگلیسی: Lorem ipsum) به متنی آزمایشی و بی‌معنی در صنعت چاپ،\n                            صفحه‌آرایی و طراحی گرافیک گفته می‌شود،\n                            تا از نظر گرافیکی نشانگر چگونگی نوع و اندازه فونت و ظاهر متن باشد.";
    			t103 = space();
    			span16 = element("span");
    			span16.textContent = "بیشتر بخوانید";
    			t105 = space();
    			div42 = element("div");
    			a25 = element("a");
    			button2 = element("button");
    			button2.textContent = "ادامه مطلب";
    			t107 = space();
    			div44 = element("div");
    			a26 = element("a");
    			img14 = element("img");
    			t108 = space();
    			span17 = element("span");
    			span17.textContent = "مسعودآقایی ساداتی";
    			t110 = text("  ");
    			t111 = space();
    			div43 = element("div");
    			i26 = element("i");
    			t112 = text(" ۵۶");
    			t113 = space();
    			aside2 = element("aside");
    			aside2.textContent = "hello1";
    			t115 = space();
    			br0 = element("br");
    			hr = element("hr");
    			br1 = element("br");
    			br2 = element("br");
    			br3 = element("br");
    			document.title = "\n        اینولینکس\n    ";
    			attr_dev(aside0, "class", "col-12 col-md-3  mx-1 mt-5 mt-md-0 bg-light shadow-radius-section");
    			add_location(aside0, file$4, 41, 8, 1157);
    			attr_dev(img0, "class", "image-pin-top");
    			if (img0.src !== (img0_src_value = "image/30.jpg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "");
    			add_location(img0, file$4, 46, 24, 1614);
    			add_location(h50, file$4, 48, 28, 1763);
    			attr_dev(a0, "class", "w-100 content-pin-top");
    			attr_dev(a0, "href", "#");
    			add_location(a0, file$4, 47, 24, 1692);
    			if (img1.src !== (img1_src_value = "/image/26.jpeg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "class", "mag-img-top");
    			attr_dev(img1, "alt", "");
    			add_location(img1, file$4, 51, 28, 1910);
    			attr_dev(a1, "href", "#");
    			add_location(a1, file$4, 50, 24, 1869);
    			set_style(i0, "color", "mediumspringgreen");
    			attr_dev(i0, "class", "fas fa-check-circle");
    			add_location(i0, file$4, 54, 60, 2111);
    			add_location(span0, file$4, 54, 28, 2079);
    			attr_dev(i1, "class", "fas fa-clock");
    			add_location(i1, file$4, 54, 144, 2195);
    			attr_dev(div0, "class", "author-time-pin-top");
    			add_location(div0, file$4, 53, 24, 2017);
    			attr_dev(article0, "class", "col-12 bg-danger mb-md-4 first-article-main ");
    			toggle_class(article0, "pin-article-height", /*h*/ ctx[2] <= 465);
    			add_location(article0, file$4, 45, 20, 1493);
    			attr_dev(div1, "class", "col-12 mb-4 my-md-0");
    			add_location(div1, file$4, 44, 16, 1439);
    			attr_dev(img2, "class", "image-pin w-100");
    			if (img2.src !== (img2_src_value = "image/28.jpg")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "alt", "");
    			add_location(img2, file$4, 60, 24, 2498);
    			add_location(h51, file$4, 62, 28, 2645);
    			attr_dev(a2, "class", "w-100 content-pin");
    			attr_dev(a2, "href", "#");
    			add_location(a2, file$4, 61, 24, 2578);
    			if (img3.src !== (img3_src_value = "/image/27.png")) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "class", "mag-img");
    			attr_dev(img3, "alt", "");
    			add_location(img3, file$4, 65, 28, 2792);
    			attr_dev(a3, "href", "#");
    			add_location(a3, file$4, 64, 24, 2751);
    			set_style(i2, "color", "mediumspringgreen");
    			attr_dev(i2, "class", "fas fa-check-circle");
    			add_location(i2, file$4, 68, 42, 2966);
    			add_location(span1, file$4, 68, 28, 2952);
    			attr_dev(i3, "class", "fas fa-clock");
    			add_location(i3, file$4, 68, 126, 3050);
    			attr_dev(div2, "class", "author-time-pin");
    			add_location(div2, file$4, 67, 24, 2894);
    			attr_dev(article1, "class", "col-12");
    			toggle_class(article1, "pin-article-height", /*h*/ ctx[2] <= 465);
    			add_location(article1, file$4, 59, 20, 2415);
    			attr_dev(div3, "class", "col-12 col-xl-6 mb-4 my-md-0 pin-article-main");
    			add_location(div3, file$4, 58, 16, 2335);
    			attr_dev(img4, "class", "image-pin w-100");
    			if (img4.src !== (img4_src_value = "image/20.jpg")) attr_dev(img4, "src", img4_src_value);
    			attr_dev(img4, "alt", "");
    			add_location(img4, file$4, 74, 24, 3370);
    			add_location(h52, file$4, 76, 28, 3517);
    			attr_dev(a4, "class", "w-100 content-pin");
    			attr_dev(a4, "href", "#");
    			add_location(a4, file$4, 75, 24, 3450);
    			if (img5.src !== (img5_src_value = "/image/25.jpg")) attr_dev(img5, "src", img5_src_value);
    			attr_dev(img5, "class", "mag-img");
    			attr_dev(img5, "alt", "");
    			add_location(img5, file$4, 79, 28, 3643);
    			attr_dev(a5, "href", "#");
    			add_location(a5, file$4, 78, 24, 3602);
    			set_style(i4, "color", "mediumspringgreen");
    			attr_dev(i4, "class", "fas fa-check-circle");
    			add_location(i4, file$4, 82, 49, 3824);
    			add_location(span2, file$4, 82, 28, 3803);
    			attr_dev(i5, "class", "fas fa-clock");
    			add_location(i5, file$4, 82, 133, 3908);
    			attr_dev(div4, "class", "author-time-pin");
    			add_location(div4, file$4, 81, 24, 3745);
    			attr_dev(article2, "class", "col-12");
    			toggle_class(article2, "pin-article-height", /*h*/ ctx[2] <= 465);
    			add_location(article2, file$4, 73, 20, 3287);
    			attr_dev(div5, "class", "col-12 col-xl-6 mb-4 mt-lg-4 mt-xl-0 mt-md-4  pin-article-main");
    			add_location(div5, file$4, 72, 16, 3190);
    			attr_dev(section0, "class", "row justify-content-md-center mx-0 pt-3 bg-light shadow-radius-section");
    			add_location(section0, file$4, 43, 12, 1333);
    			attr_dev(img6, "class", "cu-image-com mr-1 ");
    			if (img6.src !== (img6_src_value = "image/afarine.jpg")) attr_dev(img6, "src", img6_src_value);
    			attr_dev(img6, "alt", "");
    			add_location(img6, file$4, 95, 44, 4673);
    			attr_dev(div6, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div6, file$4, 94, 40, 4559);
    			set_style(i6, "color", "#048af7");
    			attr_dev(i6, "class", "fas fa-check-circle");
    			add_location(i6, file$4, 99, 125, 5152);
    			attr_dev(a6, "href", "magezine");
    			attr_dev(a6, "class", "title-post-link");
    			add_location(a6, file$4, 99, 52, 5079);
    			add_location(h60, file$4, 99, 48, 5075);
    			attr_dev(i7, "class", "fas fa-clock");
    			add_location(i7, file$4, 100, 80, 5300);
    			attr_dev(span3, "class", "show-time-custome");
    			add_location(span3, file$4, 100, 48, 5268);
    			attr_dev(div7, "class", "cu-intro mt-2");
    			add_location(div7, file$4, 98, 44, 4999);
    			attr_dev(div8, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 pr-md-4 pr-xl-3 mr-lg-0 mr-lg-1 mr-xl-0 justify-content-center custome-margin-right ");
    			add_location(div8, file$4, 97, 40, 4824);
    			attr_dev(div9, "class", "row ");
    			add_location(div9, file$4, 93, 36, 4500);
    			attr_dev(div10, "class", "col-11 col-md-11");
    			add_location(div10, file$4, 92, 32, 4432);
    			attr_dev(i8, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i8, "type", "button");
    			attr_dev(i8, "data-toggle", "dropdown");
    			add_location(i8, file$4, 106, 36, 5672);
    			attr_dev(i9, "class", "far fa-bookmark");
    			add_location(i9, file$4, 108, 120, 5944);
    			attr_dev(a7, "class", "dropdown-item");
    			attr_dev(a7, "href", "#");
    			add_location(a7, file$4, 108, 85, 5909);
    			add_location(li0, file$4, 108, 40, 5864);
    			attr_dev(i10, "class", "fas fa-share-alt");
    			add_location(i10, file$4, 109, 78, 6079);
    			attr_dev(a8, "class", "dropdown-item");
    			attr_dev(a8, "href", "#");
    			add_location(a8, file$4, 109, 44, 6045);
    			add_location(li1, file$4, 109, 40, 6041);
    			attr_dev(i11, "class", "fas fa-flag");
    			add_location(i11, file$4, 110, 78, 6214);
    			attr_dev(a9, "class", "dropdown-item");
    			attr_dev(a9, "href", "#");
    			add_location(a9, file$4, 110, 44, 6180);
    			add_location(li2, file$4, 110, 40, 6176);
    			attr_dev(ul0, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul0, file$4, 107, 36, 5783);
    			attr_dev(div11, "class", "col-1 ml-0 pl-0 pr-3 pr-sm-4 pr-md-1 pr-lg-3 pr-xl-4 dropdown");
    			add_location(div11, file$4, 105, 32, 5560);
    			attr_dev(div12, "class", "row justify-content-between p-2 pl-4 pl-md-2 ");
    			add_location(div12, file$4, 91, 28, 4340);
    			attr_dev(div13, "class", "col-12");
    			add_location(div13, file$4, 90, 24, 4291);
    			attr_dev(a10, "class", "title-post-link");
    			attr_dev(a10, "href", "magezine/show-detail");
    			add_location(a10, file$4, 117, 72, 6555);
    			attr_dev(h30, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h30, file$4, 117, 28, 6511);
    			attr_dev(div14, "class", "col-12 p-0");
    			add_location(div14, file$4, 116, 24, 6458);
    			if (img7.src !== (img7_src_value = "image/30.jpg")) attr_dev(img7, "src", img7_src_value);
    			attr_dev(img7, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img7, "alt", "");
    			add_location(img7, file$4, 120, 28, 6783);
    			attr_dev(div15, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div15, file$4, 119, 24, 6697);
    			attr_dev(span4, "id", "dots");
    			add_location(span4, file$4, 126, 114, 7330);
    			attr_dev(span5, "id", "more");
    			add_location(span5, file$4, 126, 140, 7356);
    			attr_dev(span6, "id", "myBtn");
    			set_style(span6, "cursor", "pointer");
    			add_location(span6, file$4, 133, 28, 8019);
    			attr_dev(p0, "class", "col-12 mt-3 post-text");
    			add_location(p0, file$4, 123, 24, 6946);
    			attr_dev(button0, "id", "read-more");
    			attr_dev(button0, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button0, file$4, 138, 32, 8300);
    			attr_dev(a11, "href", "magezine/show-detail");
    			add_location(a11, file$4, 137, 28, 8236);
    			attr_dev(div16, "class", "col-12 ");
    			add_location(div16, file$4, 136, 24, 8186);
    			attr_dev(img8, "class", "personal-img");
    			if (img8.src !== (img8_src_value = "image/1.jpeg")) attr_dev(img8, "src", img8_src_value);
    			attr_dev(img8, "alt", "");
    			add_location(img8, file$4, 144, 32, 8677);
    			attr_dev(span7, "class", "personal-name");
    			add_location(span7, file$4, 145, 32, 8762);
    			attr_dev(a12, "class", "a-clicked");
    			attr_dev(a12, "href", "profile");
    			add_location(a12, file$4, 143, 28, 8608);
    			attr_dev(i12, "class", "fas fa-eye");
    			add_location(i12, file$4, 147, 52, 8913);
    			attr_dev(div17, "class", "view-count");
    			add_location(div17, file$4, 147, 28, 8889);
    			attr_dev(div18, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div18, file$4, 142, 24, 8533);
    			attr_dev(article3, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article3, file$4, 89, 20, 4193);
    			attr_dev(img9, "class", "cu-image-com mr-1 ");
    			if (img9.src !== (img9_src_value = "image/afarine.jpg")) attr_dev(img9, "src", img9_src_value);
    			attr_dev(img9, "alt", "");
    			add_location(img9, file$4, 156, 44, 9511);
    			attr_dev(div19, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div19, file$4, 155, 40, 9397);
    			set_style(i13, "color", "#048af7");
    			attr_dev(i13, "class", "fas fa-check-circle");
    			add_location(i13, file$4, 160, 125, 9990);
    			attr_dev(a13, "href", "magezine");
    			attr_dev(a13, "class", "title-post-link");
    			add_location(a13, file$4, 160, 52, 9917);
    			add_location(h61, file$4, 160, 48, 9913);
    			attr_dev(i14, "class", "fas fa-clock");
    			add_location(i14, file$4, 161, 80, 10138);
    			attr_dev(span8, "class", "show-time-custome");
    			add_location(span8, file$4, 161, 48, 10106);
    			attr_dev(div20, "class", "cu-intro mt-2");
    			add_location(div20, file$4, 159, 44, 9837);
    			attr_dev(div21, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 pr-md-4 pr-xl-3 mr-lg-0 mr-lg-1 mr-xl-0 justify-content-center custome-margin-right ");
    			add_location(div21, file$4, 158, 40, 9662);
    			attr_dev(div22, "class", "row ");
    			add_location(div22, file$4, 154, 36, 9338);
    			attr_dev(div23, "class", "col-11 col-md-11");
    			add_location(div23, file$4, 153, 32, 9270);
    			attr_dev(i15, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i15, "type", "button");
    			attr_dev(i15, "data-toggle", "dropdown");
    			add_location(i15, file$4, 167, 36, 10510);
    			attr_dev(i16, "class", "far fa-bookmark");
    			add_location(i16, file$4, 169, 120, 10782);
    			attr_dev(a14, "class", "dropdown-item");
    			attr_dev(a14, "href", "#");
    			add_location(a14, file$4, 169, 85, 10747);
    			add_location(li3, file$4, 169, 40, 10702);
    			attr_dev(i17, "class", "fas fa-share-alt");
    			add_location(i17, file$4, 170, 78, 10917);
    			attr_dev(a15, "class", "dropdown-item");
    			attr_dev(a15, "href", "#");
    			add_location(a15, file$4, 170, 44, 10883);
    			add_location(li4, file$4, 170, 40, 10879);
    			attr_dev(i18, "class", "fas fa-flag");
    			add_location(i18, file$4, 171, 78, 11052);
    			attr_dev(a16, "class", "dropdown-item");
    			attr_dev(a16, "href", "#");
    			add_location(a16, file$4, 171, 44, 11018);
    			add_location(li5, file$4, 171, 40, 11014);
    			attr_dev(ul1, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul1, file$4, 168, 36, 10621);
    			attr_dev(div24, "class", "col-1 ml-0 pl-0 pr-3 pr-sm-4 pr-md-1 pr-lg-3 pr-xl-4 dropdown");
    			add_location(div24, file$4, 166, 32, 10398);
    			attr_dev(div25, "class", "row justify-content-between p-2 pl-4 pl-md-2 ");
    			add_location(div25, file$4, 152, 28, 9178);
    			attr_dev(div26, "class", "col-12");
    			add_location(div26, file$4, 151, 24, 9129);
    			attr_dev(a17, "class", "title-post-link");
    			attr_dev(a17, "href", "magezine/show-detail");
    			add_location(a17, file$4, 178, 72, 11393);
    			attr_dev(h31, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h31, file$4, 178, 28, 11349);
    			attr_dev(div27, "class", "col-12 p-0");
    			add_location(div27, file$4, 177, 24, 11296);
    			if (img10.src !== (img10_src_value = "image/30.jpg")) attr_dev(img10, "src", img10_src_value);
    			attr_dev(img10, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img10, "alt", "");
    			add_location(img10, file$4, 181, 28, 11621);
    			attr_dev(div28, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div28, file$4, 180, 24, 11535);
    			attr_dev(span9, "id", "dots");
    			add_location(span9, file$4, 187, 114, 12168);
    			attr_dev(span10, "id", "more");
    			add_location(span10, file$4, 187, 140, 12194);
    			attr_dev(span11, "id", "myBtn");
    			set_style(span11, "cursor", "pointer");
    			add_location(span11, file$4, 194, 28, 12857);
    			attr_dev(p1, "class", "col-12 mt-3 post-text");
    			add_location(p1, file$4, 184, 24, 11784);
    			attr_dev(button1, "id", "read-more");
    			attr_dev(button1, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button1, file$4, 199, 32, 13138);
    			attr_dev(a18, "href", "magezine/show-detail");
    			add_location(a18, file$4, 198, 28, 13074);
    			attr_dev(div29, "class", "col-12 ");
    			add_location(div29, file$4, 197, 24, 13024);
    			attr_dev(img11, "class", "personal-img");
    			if (img11.src !== (img11_src_value = "image/1.jpeg")) attr_dev(img11, "src", img11_src_value);
    			attr_dev(img11, "alt", "");
    			add_location(img11, file$4, 205, 32, 13515);
    			attr_dev(span12, "class", "personal-name");
    			add_location(span12, file$4, 206, 32, 13600);
    			attr_dev(a19, "class", "a-clicked");
    			attr_dev(a19, "href", "profile");
    			add_location(a19, file$4, 204, 28, 13446);
    			attr_dev(i19, "class", "fas fa-eye");
    			add_location(i19, file$4, 208, 52, 13751);
    			attr_dev(div30, "class", "view-count");
    			add_location(div30, file$4, 208, 28, 13727);
    			attr_dev(div31, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div31, file$4, 203, 24, 13371);
    			attr_dev(article4, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article4, file$4, 150, 20, 9031);
    			attr_dev(img12, "class", "cu-image-com mr-1 ");
    			if (img12.src !== (img12_src_value = "image/afarine.jpg")) attr_dev(img12, "src", img12_src_value);
    			attr_dev(img12, "alt", "");
    			add_location(img12, file$4, 217, 44, 14349);
    			attr_dev(div32, "class", "col-2 col-sm-1 col-md-1 col-lg-1 p-0 pt-1 custom-width");
    			add_location(div32, file$4, 216, 40, 14235);
    			set_style(i20, "color", "#048af7");
    			attr_dev(i20, "class", "fas fa-check-circle");
    			add_location(i20, file$4, 221, 125, 14828);
    			attr_dev(a20, "href", "magezine");
    			attr_dev(a20, "class", "title-post-link");
    			add_location(a20, file$4, 221, 52, 14755);
    			add_location(h62, file$4, 221, 48, 14751);
    			attr_dev(i21, "class", "fas fa-clock");
    			add_location(i21, file$4, 222, 80, 14976);
    			attr_dev(span13, "class", "show-time-custome");
    			add_location(span13, file$4, 222, 48, 14944);
    			attr_dev(div33, "class", "cu-intro mt-2");
    			add_location(div33, file$4, 220, 44, 14675);
    			attr_dev(div34, "class", "col-9 px-0 mr-1 mr-sm-4 mr-md-3 pr-md-4 pr-xl-3 mr-lg-0 mr-lg-1 mr-xl-0 justify-content-center custome-margin-right ");
    			add_location(div34, file$4, 219, 40, 14500);
    			attr_dev(div35, "class", "row ");
    			add_location(div35, file$4, 215, 36, 14176);
    			attr_dev(div36, "class", "col-11 col-md-11");
    			add_location(div36, file$4, 214, 32, 14108);
    			attr_dev(i22, "class", "fas fa-ellipsis-h -1 ");
    			attr_dev(i22, "type", "button");
    			attr_dev(i22, "data-toggle", "dropdown");
    			add_location(i22, file$4, 228, 36, 15348);
    			attr_dev(i23, "class", "far fa-bookmark");
    			add_location(i23, file$4, 230, 120, 15620);
    			attr_dev(a21, "class", "dropdown-item");
    			attr_dev(a21, "href", "#");
    			add_location(a21, file$4, 230, 85, 15585);
    			add_location(li6, file$4, 230, 40, 15540);
    			attr_dev(i24, "class", "fas fa-share-alt");
    			add_location(i24, file$4, 231, 78, 15755);
    			attr_dev(a22, "class", "dropdown-item");
    			attr_dev(a22, "href", "#");
    			add_location(a22, file$4, 231, 44, 15721);
    			add_location(li7, file$4, 231, 40, 15717);
    			attr_dev(i25, "class", "fas fa-flag");
    			add_location(i25, file$4, 232, 78, 15890);
    			attr_dev(a23, "class", "dropdown-item");
    			attr_dev(a23, "href", "#");
    			add_location(a23, file$4, 232, 44, 15856);
    			add_location(li8, file$4, 232, 40, 15852);
    			attr_dev(ul2, "class", "dropdown-menu ellipsis-menu");
    			add_location(ul2, file$4, 229, 36, 15459);
    			attr_dev(div37, "class", "col-1 ml-0 pl-0 pr-3 pr-sm-4 pr-md-1 pr-lg-3 pr-xl-4 dropdown");
    			add_location(div37, file$4, 227, 32, 15236);
    			attr_dev(div38, "class", "row justify-content-between p-2 pl-4 pl-md-2 ");
    			add_location(div38, file$4, 213, 28, 14016);
    			attr_dev(div39, "class", "col-12");
    			add_location(div39, file$4, 212, 24, 13967);
    			attr_dev(a24, "class", "title-post-link");
    			attr_dev(a24, "href", "magezine/show-detail");
    			add_location(a24, file$4, 239, 72, 16231);
    			attr_dev(h32, "class", "title-post mt-1 mb-0 py-3 pr-3");
    			add_location(h32, file$4, 239, 28, 16187);
    			attr_dev(div40, "class", "col-12 p-0");
    			add_location(div40, file$4, 238, 24, 16134);
    			if (img13.src !== (img13_src_value = "image/30.jpg")) attr_dev(img13, "src", img13_src_value);
    			attr_dev(img13, "class", "p-0 mr-0 w-100 responsive-imagePost-height");
    			attr_dev(img13, "alt", "");
    			add_location(img13, file$4, 242, 28, 16459);
    			attr_dev(div41, "class", "col-12 p-0 mx-0 responsive-imagePost-height");
    			add_location(div41, file$4, 241, 24, 16373);
    			attr_dev(span14, "id", "dots");
    			add_location(span14, file$4, 248, 114, 17006);
    			attr_dev(span15, "id", "more");
    			add_location(span15, file$4, 248, 140, 17032);
    			attr_dev(span16, "id", "myBtn");
    			set_style(span16, "cursor", "pointer");
    			add_location(span16, file$4, 255, 28, 17695);
    			attr_dev(p2, "class", "col-12 mt-3 post-text");
    			add_location(p2, file$4, 245, 24, 16622);
    			attr_dev(button2, "id", "read-more");
    			attr_dev(button2, "class", "btn btn-sm btn-danger col-12 col-md-2 my-1 p-1 offset-0 offset-md-10");
    			add_location(button2, file$4, 260, 32, 17976);
    			attr_dev(a25, "href", "magezine/show-detail");
    			add_location(a25, file$4, 259, 28, 17912);
    			attr_dev(div42, "class", "col-12 ");
    			add_location(div42, file$4, 258, 24, 17862);
    			attr_dev(img14, "class", "personal-img");
    			if (img14.src !== (img14_src_value = "image/1.jpeg")) attr_dev(img14, "src", img14_src_value);
    			attr_dev(img14, "alt", "");
    			add_location(img14, file$4, 266, 32, 18353);
    			attr_dev(span17, "class", "personal-name");
    			add_location(span17, file$4, 267, 32, 18438);
    			attr_dev(a26, "class", "a-clicked");
    			attr_dev(a26, "href", "profile");
    			add_location(a26, file$4, 265, 28, 18284);
    			attr_dev(i26, "class", "fas fa-eye");
    			add_location(i26, file$4, 269, 52, 18589);
    			attr_dev(div43, "class", "view-count");
    			add_location(div43, file$4, 269, 28, 18565);
    			attr_dev(div44, "class", "col-12 mb-1 author-show-box pt-1");
    			add_location(div44, file$4, 264, 24, 18209);
    			attr_dev(article5, "class", "p-0  shadow-radius-section shadow-section mb-4 bg-light");
    			add_location(article5, file$4, 211, 20, 13869);
    			attr_dev(div45, "class", "col-12 p-0 main-article");
    			add_location(div45, file$4, 88, 16, 4135);
    			attr_dev(section1, "class", "row mx-0 mt-3 mr-0 pt-0 bg-light ");
    			add_location(section1, file$4, 87, 12, 4067);
    			attr_dev(aside1, "class", "col-12 col-md-6 mx-2 order-first order-md-0 ");
    			add_location(aside1, file$4, 42, 8, 1260);
    			attr_dev(aside2, "class", "col-12 col-md-2 mx-1 mt-5 mt-md-0 bg-light shadow-radius-section");
    			add_location(aside2, file$4, 275, 8, 18758);
    			attr_dev(div46, "class", "row justify-content-center mx-lg-2");
    			add_location(div46, file$4, 40, 4, 1100);
    			attr_dev(main, "class", "container-fluid pin-parent ");
    			add_location(main, file$4, 39, 0, 1036);
    			add_location(br0, file$4, 280, 0, 18887);
    			attr_dev(hr, "class", "col-10 offset-1");
    			add_location(hr, file$4, 280, 4, 18891);
    			add_location(br1, file$4, 280, 32, 18919);
    			add_location(br2, file$4, 280, 36, 18923);
    			add_location(br3, file$4, 280, 40, 18927);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, div46);
    			append_dev(div46, aside0);
    			append_dev(div46, t2);
    			append_dev(div46, aside1);
    			append_dev(aside1, section0);
    			append_dev(section0, div1);
    			append_dev(div1, article0);
    			append_dev(article0, img0);
    			append_dev(article0, t3);
    			append_dev(article0, a0);
    			append_dev(a0, h50);
    			append_dev(article0, t5);
    			append_dev(article0, a1);
    			append_dev(a1, img1);
    			append_dev(article0, t6);
    			append_dev(article0, div0);
    			append_dev(div0, span0);
    			append_dev(span0, t7);
    			append_dev(span0, i0);
    			append_dev(div0, t8);
    			append_dev(div0, i1);
    			append_dev(div0, t9);
    			append_dev(section0, t10);
    			append_dev(section0, div3);
    			append_dev(div3, article1);
    			append_dev(article1, img2);
    			append_dev(article1, t11);
    			append_dev(article1, a2);
    			append_dev(a2, h51);
    			append_dev(article1, t13);
    			append_dev(article1, a3);
    			append_dev(a3, img3);
    			append_dev(article1, t14);
    			append_dev(article1, div2);
    			append_dev(div2, span1);
    			append_dev(span1, t15);
    			append_dev(span1, i2);
    			append_dev(div2, t16);
    			append_dev(div2, i3);
    			append_dev(div2, t17);
    			append_dev(section0, t18);
    			append_dev(section0, div5);
    			append_dev(div5, article2);
    			append_dev(article2, img4);
    			append_dev(article2, t19);
    			append_dev(article2, a4);
    			append_dev(a4, h52);
    			append_dev(article2, t21);
    			append_dev(article2, a5);
    			append_dev(a5, img5);
    			append_dev(article2, t22);
    			append_dev(article2, div4);
    			append_dev(div4, span2);
    			append_dev(span2, t23);
    			append_dev(span2, i4);
    			append_dev(div4, t24);
    			append_dev(div4, i5);
    			append_dev(div4, t25);
    			append_dev(aside1, t26);
    			append_dev(aside1, section1);
    			append_dev(section1, div45);
    			append_dev(div45, article3);
    			append_dev(article3, div13);
    			append_dev(div13, div12);
    			append_dev(div12, div10);
    			append_dev(div10, div9);
    			append_dev(div9, div6);
    			append_dev(div6, img6);
    			append_dev(div9, t27);
    			append_dev(div9, div8);
    			append_dev(div8, div7);
    			append_dev(div7, h60);
    			append_dev(h60, a6);
    			append_dev(a6, t28);
    			append_dev(a6, i6);
    			append_dev(div7, t29);
    			append_dev(div7, span3);
    			append_dev(span3, i7);
    			append_dev(span3, t30);
    			append_dev(div12, t31);
    			append_dev(div12, div11);
    			append_dev(div11, i8);
    			append_dev(div11, t32);
    			append_dev(div11, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a7);
    			append_dev(a7, i9);
    			append_dev(a7, t33);
    			append_dev(ul0, t34);
    			append_dev(ul0, li1);
    			append_dev(li1, a8);
    			append_dev(a8, i10);
    			append_dev(a8, t35);
    			append_dev(ul0, t36);
    			append_dev(ul0, li2);
    			append_dev(li2, a9);
    			append_dev(a9, i11);
    			append_dev(a9, t37);
    			append_dev(article3, t38);
    			append_dev(article3, div14);
    			append_dev(div14, h30);
    			append_dev(h30, a10);
    			append_dev(article3, t40);
    			append_dev(article3, div15);
    			append_dev(div15, img7);
    			append_dev(article3, t41);
    			append_dev(article3, p0);
    			append_dev(p0, t42);
    			append_dev(p0, span4);
    			append_dev(p0, span5);
    			append_dev(p0, t45);
    			append_dev(p0, span6);
    			append_dev(article3, t47);
    			append_dev(article3, div16);
    			append_dev(div16, a11);
    			append_dev(a11, button0);
    			append_dev(article3, t49);
    			append_dev(article3, div18);
    			append_dev(div18, a12);
    			append_dev(a12, img8);
    			append_dev(a12, t50);
    			append_dev(a12, span7);
    			append_dev(a12, t52);
    			append_dev(div18, t53);
    			append_dev(div18, div17);
    			append_dev(div17, i12);
    			append_dev(div17, t54);
    			append_dev(div45, t55);
    			append_dev(div45, article4);
    			append_dev(article4, div26);
    			append_dev(div26, div25);
    			append_dev(div25, div23);
    			append_dev(div23, div22);
    			append_dev(div22, div19);
    			append_dev(div19, img9);
    			append_dev(div22, t56);
    			append_dev(div22, div21);
    			append_dev(div21, div20);
    			append_dev(div20, h61);
    			append_dev(h61, a13);
    			append_dev(a13, t57);
    			append_dev(a13, i13);
    			append_dev(div20, t58);
    			append_dev(div20, span8);
    			append_dev(span8, i14);
    			append_dev(span8, t59);
    			append_dev(div25, t60);
    			append_dev(div25, div24);
    			append_dev(div24, i15);
    			append_dev(div24, t61);
    			append_dev(div24, ul1);
    			append_dev(ul1, li3);
    			append_dev(li3, a14);
    			append_dev(a14, i16);
    			append_dev(a14, t62);
    			append_dev(ul1, t63);
    			append_dev(ul1, li4);
    			append_dev(li4, a15);
    			append_dev(a15, i17);
    			append_dev(a15, t64);
    			append_dev(ul1, t65);
    			append_dev(ul1, li5);
    			append_dev(li5, a16);
    			append_dev(a16, i18);
    			append_dev(a16, t66);
    			append_dev(article4, t67);
    			append_dev(article4, div27);
    			append_dev(div27, h31);
    			append_dev(h31, a17);
    			append_dev(article4, t69);
    			append_dev(article4, div28);
    			append_dev(div28, img10);
    			append_dev(article4, t70);
    			append_dev(article4, p1);
    			append_dev(p1, t71);
    			append_dev(p1, span9);
    			append_dev(p1, span10);
    			append_dev(p1, t74);
    			append_dev(p1, span11);
    			append_dev(article4, t76);
    			append_dev(article4, div29);
    			append_dev(div29, a18);
    			append_dev(a18, button1);
    			append_dev(article4, t78);
    			append_dev(article4, div31);
    			append_dev(div31, a19);
    			append_dev(a19, img11);
    			append_dev(a19, t79);
    			append_dev(a19, span12);
    			append_dev(a19, t81);
    			append_dev(div31, t82);
    			append_dev(div31, div30);
    			append_dev(div30, i19);
    			append_dev(div30, t83);
    			append_dev(div45, t84);
    			append_dev(div45, article5);
    			append_dev(article5, div39);
    			append_dev(div39, div38);
    			append_dev(div38, div36);
    			append_dev(div36, div35);
    			append_dev(div35, div32);
    			append_dev(div32, img12);
    			append_dev(div35, t85);
    			append_dev(div35, div34);
    			append_dev(div34, div33);
    			append_dev(div33, h62);
    			append_dev(h62, a20);
    			append_dev(a20, t86);
    			append_dev(a20, i20);
    			append_dev(div33, t87);
    			append_dev(div33, span13);
    			append_dev(span13, i21);
    			append_dev(span13, t88);
    			append_dev(div38, t89);
    			append_dev(div38, div37);
    			append_dev(div37, i22);
    			append_dev(div37, t90);
    			append_dev(div37, ul2);
    			append_dev(ul2, li6);
    			append_dev(li6, a21);
    			append_dev(a21, i23);
    			append_dev(a21, t91);
    			append_dev(ul2, t92);
    			append_dev(ul2, li7);
    			append_dev(li7, a22);
    			append_dev(a22, i24);
    			append_dev(a22, t93);
    			append_dev(ul2, t94);
    			append_dev(ul2, li8);
    			append_dev(li8, a23);
    			append_dev(a23, i25);
    			append_dev(a23, t95);
    			append_dev(article5, t96);
    			append_dev(article5, div40);
    			append_dev(div40, h32);
    			append_dev(h32, a24);
    			append_dev(article5, t98);
    			append_dev(article5, div41);
    			append_dev(div41, img13);
    			append_dev(article5, t99);
    			append_dev(article5, p2);
    			append_dev(p2, t100);
    			append_dev(p2, span14);
    			append_dev(p2, span15);
    			append_dev(p2, t103);
    			append_dev(p2, span16);
    			append_dev(article5, t105);
    			append_dev(article5, div42);
    			append_dev(div42, a25);
    			append_dev(a25, button2);
    			append_dev(article5, t107);
    			append_dev(article5, div44);
    			append_dev(div44, a26);
    			append_dev(a26, img14);
    			append_dev(a26, t108);
    			append_dev(a26, span17);
    			append_dev(a26, t110);
    			append_dev(div44, t111);
    			append_dev(div44, div43);
    			append_dev(div43, i26);
    			append_dev(div43, t112);
    			append_dev(div46, t113);
    			append_dev(div46, aside2);
    			insert_dev(target, t115, anchor);
    			insert_dev(target, br0, anchor);
    			insert_dev(target, hr, anchor);
    			insert_dev(target, br1, anchor);
    			insert_dev(target, br2, anchor);
    			insert_dev(target, br3, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1, "scroll", () => {
    						scrolling = true;
    						clearTimeout(scrolling_timeout);
    						scrolling_timeout = setTimeout(clear_scrolling, 100);
    						/*onwindowscroll*/ ctx[6]();
    					}),
    					listen_dev(window_1, "resize", /*onwindowresize*/ ctx[7]),
    					listen_dev(span6, "click", myFunction, false, false, false),
    					listen_dev(span11, "click", myFunction, false, false, false),
    					listen_dev(span16, "click", myFunction, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 1 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window_1.pageXOffset, /*y*/ ctx[0]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}

    			if (dirty & /*h*/ 4) {
    				toggle_class(article0, "pin-article-height", /*h*/ ctx[2] <= 465);
    			}

    			if (dirty & /*h*/ 4) {
    				toggle_class(article1, "pin-article-height", /*h*/ ctx[2] <= 465);
    			}

    			if (dirty & /*h*/ 4) {
    				toggle_class(article2, "pin-article-height", /*h*/ ctx[2] <= 465);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, true);
    				main_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!main_transition) main_transition = create_bidirectional_transition(main, scale, {}, false);
    			main_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (detaching && main_transition) main_transition.end();
    			if (detaching) detach_dev(t115);
    			if (detaching) detach_dev(br0);
    			if (detaching) detach_dev(hr);
    			if (detaching) detach_dev(br1);
    			if (detaching) detach_dev(br2);
    			if (detaching) detach_dev(br3);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Home", slots, []);
    	let { url = "" } = $$props;
    	let { id = 1 } = $$props;
    	let { y } = $$props;
    	let { x } = $$props;
    	let { h } = $$props;
    	let { post = [] } = $$props;

    	onMount(async () => {
    		const res = await fetch("http://localhost:8000/post/page/1/");
    		$$invalidate(3, post = await res.json());
    		$$invalidate(3, post = post.data);
    	});

    	var currentLocation = window.location.href;
    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];
    	const writable_props = ["url", "id", "y", "x", "h", "post"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Home> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(0, y = window_1.pageYOffset);
    	}

    	function onwindowresize() {
    		$$invalidate(1, x = window_1.innerWidth);
    		$$invalidate(2, h = window_1.innerHeight);
    	}

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("id" in $$props) $$invalidate(5, id = $$props.id);
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    		if ("x" in $$props) $$invalidate(1, x = $$props.x);
    		if ("h" in $$props) $$invalidate(2, h = $$props.h);
    		if ("post" in $$props) $$invalidate(3, post = $$props.post);
    	};

    	$$self.$capture_state = () => ({
    		Magezine,
    		onMount,
    		fade,
    		slide,
    		scale,
    		fly,
    		circIn,
    		Router,
    		Link,
    		Route,
    		about: About,
    		showDetail: Show_detail,
    		url,
    		id,
    		y,
    		x,
    		h,
    		post,
    		currentLocation,
    		splitUrl,
    		lastSugment
    	});

    	$$self.$inject_state = $$props => {
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("id" in $$props) $$invalidate(5, id = $$props.id);
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    		if ("x" in $$props) $$invalidate(1, x = $$props.x);
    		if ("h" in $$props) $$invalidate(2, h = $$props.h);
    		if ("post" in $$props) $$invalidate(3, post = $$props.post);
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) lastSugment = $$props.lastSugment;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [y, x, h, post, url, id, onwindowscroll, onwindowresize];
    }

    class Home extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { url: 4, id: 5, y: 0, x: 1, h: 2, post: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Home",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[0] === undefined && !("y" in props)) {
    			console.warn("<Home> was created without expected prop 'y'");
    		}

    		if (/*x*/ ctx[1] === undefined && !("x" in props)) {
    			console.warn("<Home> was created without expected prop 'x'");
    		}

    		if (/*h*/ ctx[2] === undefined && !("h" in props)) {
    			console.warn("<Home> was created without expected prop 'h'");
    		}
    	}

    	get url() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get x() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get h() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set h(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get post() {
    		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set post(value) {
    		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/layout/Nav.svelte generated by Svelte v3.38.3 */

    const { console: console_1 } = globals;
    const file$3 = "src/layout/Nav.svelte";

    // (39:36) <Link to="/" class="menu-item-link-color">
    function create_default_slot_5(ctx) {
    	let div;
    	let i;
    	let span;
    	let br;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			i = element("i");
    			span = element("span");
    			br = element("br");
    			t = text("خانه");
    			add_location(br, file$3, 40, 137, 1645);
    			attr_dev(span, "class", "menu-item d-none d-md-inline");
    			add_location(span, file$3, 40, 94, 1602);
    			attr_dev(i, "class", "fas fa-home ml-1 p-0 m-0 mt-2 mt-md-0");
    			add_location(i, file$3, 40, 44, 1552);
    			set_style(div, "height", "25px");
    			attr_dev(div, "class", "col-12 mt-2 px-auto menu-icon pb-0 mb-0");
    			add_location(div, file$3, 39, 40, 1432);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, i);
    			append_dev(i, span);
    			append_dev(span, br);
    			append_dev(span, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_5.name,
    		type: "slot",
    		source: "(39:36) <Link to=\\\"/\\\" class=\\\"menu-item-link-color\\\">",
    		ctx
    	});

    	return block;
    }

    // (46:36) <Link class="menu-item-link-color" to="profile">
    function create_default_slot_4(ctx) {
    	let div;
    	let i;
    	let span;
    	let br;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			i = element("i");
    			span = element("span");
    			br = element("br");
    			t = text("پروفایل فرد");
    			add_location(br, file$3, 47, 142, 2192);
    			attr_dev(span, "class", "menu-item d-none d-md-inline");
    			add_location(span, file$3, 47, 99, 2149);
    			attr_dev(i, "class", "fas fa-mail-bulk ml-1 p-0 m-0 mt-2 mt-md-0");
    			add_location(i, file$3, 47, 44, 2094);
    			set_style(div, "height", "25px");
    			attr_dev(div, "class", "col-12 mt-2 px-auto menu-icon ");
    			add_location(div, file$3, 46, 40, 1983);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, i);
    			append_dev(i, span);
    			append_dev(span, br);
    			append_dev(span, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(46:36) <Link class=\\\"menu-item-link-color\\\" to=\\\"profile\\\">",
    		ctx
    	});

    	return block;
    }

    // (53:36) <Link class="menu-item-link-color" to="show-detail">
    function create_default_slot_3(ctx) {
    	let div;
    	let i;
    	let span;
    	let br;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			i = element("i");
    			span = element("span");
    			br = element("br");
    			t = text("جزيیات");
    			add_location(br, file$3, 54, 144, 2760);
    			attr_dev(span, "class", "menu-item d-none d-md-inline");
    			add_location(span, file$3, 54, 101, 2717);
    			attr_dev(i, "class", "fas fa-info-circle ml-1 p-0 m-0 mt-2 mt-md-0");
    			add_location(i, file$3, 54, 44, 2660);
    			set_style(div, "height", "25px");
    			attr_dev(div, "class", "col-12 mt-2 px-auto menu-icon pb-0 mb-0");
    			add_location(div, file$3, 53, 40, 2540);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, i);
    			append_dev(i, span);
    			append_dev(span, br);
    			append_dev(span, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(53:36) <Link class=\\\"menu-item-link-color\\\" to=\\\"show-detail\\\">",
    		ctx
    	});

    	return block;
    }

    // (61:36) <Link class="menu-item-link-color" to="magezine">
    function create_default_slot_2(ctx) {
    	let div;
    	let i;
    	let span;
    	let br;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			i = element("i");
    			span = element("span");
    			br = element("br");
    			t = text("مجله");
    			add_location(br, file$3, 62, 140, 3349);
    			attr_dev(span, "class", "menu-item d-none d-md-inline");
    			add_location(span, file$3, 62, 97, 3306);
    			attr_dev(i, "class", "fas fa-feather ml-1 p-0 m-0 mt-2 mt-md-0");
    			add_location(i, file$3, 62, 44, 3253);
    			set_style(div, "height", "25px");
    			attr_dev(div, "class", "col-12 mt-2 px-auto menu-icon pb-0 mb-0");
    			add_location(div, file$3, 61, 40, 3133);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, i);
    			append_dev(i, span);
    			append_dev(span, br);
    			append_dev(span, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(61:36) <Link class=\\\"menu-item-link-color\\\" to=\\\"magezine\\\">",
    		ctx
    	});

    	return block;
    }

    // (79:20) <Link to="/">
    function create_default_slot_1(ctx) {
    	let div1;
    	let div0;
    	let span;
    	let t1;
    	let div2;
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			span.textContent = "اینولینکس";
    			t1 = space();
    			div2 = element("div");
    			img = element("img");
    			attr_dev(span, "class", "brand-icon-custome");
    			add_location(span, file$3, 81, 32, 4468);
    			attr_dev(div0, "class", "brand-text mx-0");
    			add_location(div0, file$3, 80, 28, 4406);
    			attr_dev(div1, "class", "col-7 ");
    			add_location(div1, file$3, 79, 24, 4357);
    			if (img.src !== (img_src_value = /*src*/ ctx[2])) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "class", "brand-icon mt-2");
    			attr_dev(img, "alt", "");
    			add_location(img, file$3, 85, 28, 4663);
    			attr_dev(div2, "class", "col-1 h-100");
    			add_location(div2, file$3, 84, 24, 4609);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, span);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, img);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*src*/ 4 && img.src !== (img_src_value = /*src*/ ctx[2])) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(79:20) <Link to=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (28:0) <Router url="{url}">
    function create_default_slot(ctx) {
    	let header;
    	let nav;
    	let div12;
    	let div10;
    	let div9;
    	let div8;
    	let div7;
    	let div0;
    	let link0;
    	let t0;
    	let div1;
    	let link1;
    	let t1;
    	let div2;
    	let link2;
    	let t2;
    	let div3;
    	let link3;
    	let t3;
    	let div6;
    	let div5;
    	let div4;
    	let i1;
    	let span;
    	let br;
    	let i0;
    	let t4;
    	let t5;
    	let div11;
    	let link4;
    	let t6;
    	let div13;
    	let route0;
    	let t7;
    	let route1;
    	let t8;
    	let route2;
    	let t9;
    	let route3;
    	let t10;
    	let route4;
    	let t11;
    	let route5;
    	let t12;
    	let route6;
    	let t13;
    	let route7;
    	let current;

    	link0 = new Link({
    			props: {
    				to: "/",
    				class: "menu-item-link-color",
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link1 = new Link({
    			props: {
    				class: "menu-item-link-color",
    				to: "profile",
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link2 = new Link({
    			props: {
    				class: "menu-item-link-color",
    				to: "show-detail",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link3 = new Link({
    			props: {
    				class: "menu-item-link-color",
    				to: "magezine",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	link4 = new Link({
    			props: {
    				to: "/",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route0 = new Route({
    			props: { path: "contact", component: Contact },
    			$$inline: true
    		});

    	route1 = new Route({
    			props: { path: "about", component: About },
    			$$inline: true
    		});

    	route2 = new Route({
    			props: { path: "/", component: Home },
    			$$inline: true
    		});

    	route3 = new Route({
    			props: { path: "profile", component: Profile },
    			$$inline: true
    		});

    	route4 = new Route({
    			props: { path: "magezine", component: Magezine },
    			$$inline: true
    		});

    	route5 = new Route({
    			props: {
    				path: "profile/show-detail",
    				component: Show_detail
    			},
    			$$inline: true
    		});

    	route6 = new Route({
    			props: {
    				path: "magezine/show-detail",
    				component: Show_detail
    			},
    			$$inline: true
    		});

    	route7 = new Route({
    			props: {
    				path: "show-detail",
    				component: Show_detail
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			header = element("header");
    			nav = element("nav");
    			div12 = element("div");
    			div10 = element("div");
    			div9 = element("div");
    			div8 = element("div");
    			div7 = element("div");
    			div0 = element("div");
    			create_component(link0.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(link1.$$.fragment);
    			t1 = space();
    			div2 = element("div");
    			create_component(link2.$$.fragment);
    			t2 = space();
    			div3 = element("div");
    			create_component(link3.$$.fragment);
    			t3 = space();
    			div6 = element("div");
    			div5 = element("div");
    			div4 = element("div");
    			i1 = element("i");
    			span = element("span");
    			br = element("br");
    			i0 = element("i");
    			t4 = text(" ابزار");
    			t5 = space();
    			div11 = element("div");
    			create_component(link4.$$.fragment);
    			t6 = space();
    			div13 = element("div");
    			create_component(route0.$$.fragment);
    			t7 = space();
    			create_component(route1.$$.fragment);
    			t8 = space();
    			create_component(route2.$$.fragment);
    			t9 = space();
    			create_component(route3.$$.fragment);
    			t10 = space();
    			create_component(route4.$$.fragment);
    			t11 = space();
    			create_component(route5.$$.fragment);
    			t12 = space();
    			create_component(route6.$$.fragment);
    			t13 = space();
    			create_component(route7.$$.fragment);
    			attr_dev(div0, "class", "col-2 col-md-1");
    			add_location(div0, file$3, 37, 32, 1284);
    			attr_dev(div1, "class", "col-2 col-md-1 ");
    			add_location(div1, file$3, 44, 32, 1828);
    			attr_dev(div2, "class", "col-2 col-md-1 ");
    			add_location(div2, file$3, 51, 32, 2381);
    			attr_dev(div3, "class", "col-2 col-md-1 ");
    			add_location(div3, file$3, 59, 32, 2977);
    			add_location(br, file$3, 69, 140, 3944);
    			attr_dev(i0, "class", "fas fa-sort-down");
    			add_location(i0, file$3, 69, 144, 3948);
    			attr_dev(span, "class", "menu-item d-none d-md-inline");
    			add_location(span, file$3, 69, 97, 3901);
    			attr_dev(i1, "class", "fas fa-toolbox ml-1 p-0 m-0 mt-2 mt-md-0");
    			add_location(i1, file$3, 69, 44, 3848);
    			set_style(div4, "height", "25px");
    			attr_dev(div4, "class", "col-12 mt-2 px-auto menu-icon pb-0 mb-0 dropdown");
    			add_location(div4, file$3, 68, 40, 3719);
    			attr_dev(div5, "class", "menu-item-link-color");
    			add_location(div5, file$3, 67, 36, 3644);
    			attr_dev(div6, "class", "col-2 col-md-1");
    			attr_dev(div6, "data-toggle", "modal");
    			attr_dev(div6, "data-target", "#exampleModal");
    			add_location(div6, file$3, 66, 32, 3531);
    			attr_dev(div7, "class", "row justify-content-start mt-1");
    			set_style(div7, "direction", "rtl");
    			add_location(div7, file$3, 36, 28, 1183);
    			attr_dev(div8, "class", "col-12");
    			add_location(div8, file$3, 34, 24, 1105);
    			attr_dev(div9, "class", "row ");
    			add_location(div9, file$3, 33, 20, 1062);
    			attr_dev(div10, "class", "col-9 px-0");
    			add_location(div10, file$3, 32, 16, 1017);
    			attr_dev(div11, "class", "col-3 col-md-2 pl-2 ");
    			add_location(div11, file$3, 77, 16, 4264);
    			attr_dev(div12, "class", "row justify-content-end ");
    			add_location(div12, file$3, 31, 12, 961);
    			attr_dev(nav, "class", "container-fluid pb-0 ");
    			add_location(nav, file$3, 30, 8, 911);
    			attr_dev(header, "class", "sticky-top ");
    			toggle_class(header, "nav-custome-bottom", /*y*/ ctx[1] <= 600);
    			add_location(header, file$3, 29, 4, 839);
    			add_location(div13, file$3, 93, 4, 4861);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, nav);
    			append_dev(nav, div12);
    			append_dev(div12, div10);
    			append_dev(div10, div9);
    			append_dev(div9, div8);
    			append_dev(div8, div7);
    			append_dev(div7, div0);
    			mount_component(link0, div0, null);
    			append_dev(div7, t0);
    			append_dev(div7, div1);
    			mount_component(link1, div1, null);
    			append_dev(div7, t1);
    			append_dev(div7, div2);
    			mount_component(link2, div2, null);
    			append_dev(div7, t2);
    			append_dev(div7, div3);
    			mount_component(link3, div3, null);
    			append_dev(div7, t3);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, div4);
    			append_dev(div4, i1);
    			append_dev(i1, span);
    			append_dev(span, br);
    			append_dev(span, i0);
    			append_dev(span, t4);
    			append_dev(div12, t5);
    			append_dev(div12, div11);
    			mount_component(link4, div11, null);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, div13, anchor);
    			mount_component(route0, div13, null);
    			append_dev(div13, t7);
    			mount_component(route1, div13, null);
    			append_dev(div13, t8);
    			mount_component(route2, div13, null);
    			append_dev(div13, t9);
    			mount_component(route3, div13, null);
    			append_dev(div13, t10);
    			mount_component(route4, div13, null);
    			append_dev(div13, t11);
    			mount_component(route5, div13, null);
    			append_dev(div13, t12);
    			mount_component(route6, div13, null);
    			append_dev(div13, t13);
    			mount_component(route7, div13, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const link0_changes = {};

    			if (dirty & /*$$scope*/ 64) {
    				link0_changes.$$scope = { dirty, ctx };
    			}

    			link0.$set(link0_changes);
    			const link1_changes = {};

    			if (dirty & /*$$scope*/ 64) {
    				link1_changes.$$scope = { dirty, ctx };
    			}

    			link1.$set(link1_changes);
    			const link2_changes = {};

    			if (dirty & /*$$scope*/ 64) {
    				link2_changes.$$scope = { dirty, ctx };
    			}

    			link2.$set(link2_changes);
    			const link3_changes = {};

    			if (dirty & /*$$scope*/ 64) {
    				link3_changes.$$scope = { dirty, ctx };
    			}

    			link3.$set(link3_changes);
    			const link4_changes = {};

    			if (dirty & /*$$scope, src*/ 68) {
    				link4_changes.$$scope = { dirty, ctx };
    			}

    			link4.$set(link4_changes);

    			if (dirty & /*y*/ 2) {
    				toggle_class(header, "nav-custome-bottom", /*y*/ ctx[1] <= 600);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(link0.$$.fragment, local);
    			transition_in(link1.$$.fragment, local);
    			transition_in(link2.$$.fragment, local);
    			transition_in(link3.$$.fragment, local);
    			transition_in(link4.$$.fragment, local);
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			transition_in(route2.$$.fragment, local);
    			transition_in(route3.$$.fragment, local);
    			transition_in(route4.$$.fragment, local);
    			transition_in(route5.$$.fragment, local);
    			transition_in(route6.$$.fragment, local);
    			transition_in(route7.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(link0.$$.fragment, local);
    			transition_out(link1.$$.fragment, local);
    			transition_out(link2.$$.fragment, local);
    			transition_out(link3.$$.fragment, local);
    			transition_out(link4.$$.fragment, local);
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			transition_out(route2.$$.fragment, local);
    			transition_out(route3.$$.fragment, local);
    			transition_out(route4.$$.fragment, local);
    			transition_out(route5.$$.fragment, local);
    			transition_out(route6.$$.fragment, local);
    			transition_out(route7.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			destroy_component(link0);
    			destroy_component(link1);
    			destroy_component(link2);
    			destroy_component(link3);
    			destroy_component(link4);
    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(div13);
    			destroy_component(route0);
    			destroy_component(route1);
    			destroy_component(route2);
    			destroy_component(route3);
    			destroy_component(route4);
    			destroy_component(route5);
    			destroy_component(route6);
    			destroy_component(route7);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(28:0) <Router url=\\\"{url}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let router;
    	let t0;
    	let div5;
    	let div4;
    	let div3;
    	let div1;
    	let div0;
    	let t2;
    	let div2;
    	let button;
    	let current;

    	router = new Router({
    			props: {
    				url: /*url*/ ctx[0],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(router.$$.fragment);
    			t0 = space();
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "حاجی خالیه چیزی نیست";
    			t2 = space();
    			div2 = element("div");
    			button = element("button");
    			button.textContent = "Close";
    			attr_dev(div0, "class", "nav flex-sm-column flex-row text-center");
    			add_location(div0, file$3, 108, 20, 5638);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file$3, 107, 16, 5593);
    			attr_dev(button, "type", "button");
    			attr_dev(button, "class", "btn btn-secondary");
    			attr_dev(button, "data-dismiss", "modal");
    			add_location(button, file$3, 113, 20, 5850);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file$3, 112, 16, 5803);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file$3, 106, 12, 5549);
    			attr_dev(div4, "class", "modal-dialog");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file$3, 105, 8, 5494);
    			attr_dev(div5, "class", "modal left fade");
    			attr_dev(div5, "id", "exampleModal");
    			attr_dev(div5, "tabindex", "");
    			attr_dev(div5, "role", "dialog");
    			attr_dev(div5, "aria-labelledby", "exampleModalLabel");
    			attr_dev(div5, "aria-hidden", "true");
    			add_location(div5, file$3, 104, 4, 5357);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(router, target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div1);
    			append_dev(div1, div0);
    			append_dev(div3, t2);
    			append_dev(div3, div2);
    			append_dev(div2, button);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const router_changes = {};
    			if (dirty & /*url*/ 1) router_changes.url = /*url*/ ctx[0];

    			if (dirty & /*$$scope, y, src*/ 70) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(router, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div5);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Nav", slots, []);
    	let { url = "" } = $$props;
    	let { y } = $$props;
    	var currentLocation = window.location.href;
    	var splitUrl = currentLocation.split("/");
    	var lastSugment = splitUrl[splitUrl.length - 1];
    	let src;

    	if (lastSugment === "show-detail") {
    		src = "../image/1.png";
    	} else {
    		src = "image/1.png";
    	}

    	const writable_props = ["url", "y"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(0, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    	};

    	$$self.$capture_state = () => ({
    		Router,
    		Link,
    		Route,
    		fade,
    		slide,
    		scale,
    		fly,
    		about: About,
    		contact: Contact,
    		magezine: Magezine,
    		profile: Profile,
    		showDetail: Show_detail,
    		home: Home,
    		url,
    		y,
    		currentLocation,
    		splitUrl,
    		lastSugment,
    		src
    	});

    	$$self.$inject_state = $$props => {
    		if ("url" in $$props) $$invalidate(0, url = $$props.url);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("currentLocation" in $$props) currentLocation = $$props.currentLocation;
    		if ("splitUrl" in $$props) splitUrl = $$props.splitUrl;
    		if ("lastSugment" in $$props) $$invalidate(5, lastSugment = $$props.lastSugment);
    		if ("src" in $$props) $$invalidate(2, src = $$props.src);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	console.log(lastSugment);
    	return [url, y, src];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { url: 0, y: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[1] === undefined && !("y" in props)) {
    			console_1.warn("<Nav> was created without expected prop 'y'");
    		}
    	}

    	get url() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/layout/Footer.svelte generated by Svelte v3.38.3 */

    const file$2 = "src/layout/Footer.svelte";

    function create_fragment$2(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let footer;
    	let div8;
    	let div7;
    	let div0;
    	let form;
    	let fieldset0;
    	let input;
    	let t0;
    	let fieldset1;
    	let textarea;
    	let t1;
    	let fieldset2;
    	let button;
    	let t3;
    	let div2;
    	let h50;
    	let t5;
    	let hr;
    	let t6;
    	let div1;
    	let ul0;
    	let li0;
    	let a0;
    	let i0;
    	let t7;
    	let li1;
    	let a1;
    	let i1;
    	let t8;
    	let li2;
    	let a2;
    	let i2;
    	let t9;
    	let li3;
    	let a3;
    	let i3;
    	let t10;
    	let br;
    	let t11;
    	let div6;
    	let h51;
    	let i4;
    	let t12;
    	let span0;
    	let span1;
    	let t15;
    	let div5;
    	let div3;
    	let ul1;
    	let li4;
    	let a4;
    	let t17;
    	let li5;
    	let a5;
    	let t19;
    	let li6;
    	let a6;
    	let t21;
    	let li7;
    	let a7;
    	let t23;
    	let div4;
    	let ul2;
    	let li8;
    	let a8;
    	let t25;
    	let li9;
    	let a9;
    	let t27;
    	let li10;
    	let a10;
    	let t29;
    	let li11;
    	let a11;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[1]);

    	const block = {
    		c: function create() {
    			footer = element("footer");
    			div8 = element("div");
    			div7 = element("div");
    			div0 = element("div");
    			form = element("form");
    			fieldset0 = element("fieldset");
    			input = element("input");
    			t0 = space();
    			fieldset1 = element("fieldset");
    			textarea = element("textarea");
    			t1 = space();
    			fieldset2 = element("fieldset");
    			button = element("button");
    			button.textContent = "ارسال";
    			t3 = space();
    			div2 = element("div");
    			h50 = element("h5");
    			h50.textContent = "ما را در شبکه های اجتماعی دنبال کنید";
    			t5 = space();
    			hr = element("hr");
    			t6 = space();
    			div1 = element("div");
    			ul0 = element("ul");
    			li0 = element("li");
    			a0 = element("a");
    			i0 = element("i");
    			t7 = space();
    			li1 = element("li");
    			a1 = element("a");
    			i1 = element("i");
    			t8 = space();
    			li2 = element("li");
    			a2 = element("a");
    			i2 = element("i");
    			t9 = space();
    			li3 = element("li");
    			a3 = element("a");
    			i3 = element("i");
    			t10 = space();
    			br = element("br");
    			t11 = space();
    			div6 = element("div");
    			h51 = element("h5");
    			i4 = element("i");
    			t12 = space();
    			span0 = element("span");
    			span0.textContent = "اینو";
    			span1 = element("span");
    			span1.textContent = "لینکس";
    			t15 = space();
    			div5 = element("div");
    			div3 = element("div");
    			ul1 = element("ul");
    			li4 = element("li");
    			a4 = element("a");
    			a4.textContent = "مدیریت بخش اصلی سایت";
    			t17 = space();
    			li5 = element("li");
    			a5 = element("a");
    			a5.textContent = "برنامه ریزی";
    			t19 = space();
    			li6 = element("li");
    			a6 = element("a");
    			a6.textContent = "اسناد طبقه بندی شده";
    			t21 = space();
    			li7 = element("li");
    			a7 = element("a");
    			a7.textContent = "سرویس دو پارچه آگرین";
    			t23 = space();
    			div4 = element("div");
    			ul2 = element("ul");
    			li8 = element("li");
    			a8 = element("a");
    			a8.textContent = "داده های ثبت احوال";
    			t25 = space();
    			li9 = element("li");
    			a9 = element("a");
    			a9.textContent = "پشتیبانی سایت";
    			t27 = space();
    			li10 = element("li");
    			a10 = element("a");
    			a10.textContent = "اعضای تیم مرکزی";
    			t29 = space();
    			li11 = element("li");
    			a11 = element("a");
    			a11.textContent = "طرح سوال از مخاطب";
    			set_style(input, "text-align", "right");
    			set_style(input, "font-family", "BYekan");
    			attr_dev(input, "type", "email");
    			attr_dev(input, "class", "form-control svelte-ph1nu5");
    			attr_dev(input, "id", "exampleInputEmail1");
    			attr_dev(input, "placeholder", "لطفا ایمیل خود را وارد کنید");
    			add_location(input, file$2, 71, 24, 1275);
    			attr_dev(fieldset0, "class", "form-group svelte-ph1nu5");
    			add_location(fieldset0, file$2, 70, 20, 1212);
    			set_style(textarea, "text-align", "right");
    			set_style(textarea, "font-family", "BYekan");
    			attr_dev(textarea, "class", "form-control svelte-ph1nu5");
    			attr_dev(textarea, "id", "exampleMessage");
    			attr_dev(textarea, "placeholder", "متن");
    			add_location(textarea, file$2, 74, 24, 1536);
    			attr_dev(fieldset1, "class", "form-group svelte-ph1nu5");
    			add_location(fieldset1, file$2, 73, 20, 1482);
    			set_style(button, "text-align", "right");
    			set_style(button, "font-family", "BYekan");
    			attr_dev(button, "type", "button");
    			attr_dev(button, "class", "btn btn-danger btn-lg");
    			add_location(button, file$2, 77, 24, 1784);
    			attr_dev(fieldset2, "class", "form-group text-xs-right svelte-ph1nu5");
    			add_location(fieldset2, file$2, 76, 20, 1716);
    			set_style(form, "direction", "rtl");
    			add_location(form, file$2, 69, 16, 1161);
    			attr_dev(div0, "class", "col-md-4");
    			add_location(div0, file$2, 68, 12, 1122);
    			attr_dev(h50, "class", "text-md-right");
    			add_location(h50, file$2, 82, 16, 2063);
    			add_location(hr, file$2, 83, 16, 2147);
    			attr_dev(i0, "class", "fab fa-github fa-lg svelte-ph1nu5");
    			add_location(i0, file$2, 86, 78, 2302);
    			attr_dev(a0, "href", "");
    			attr_dev(a0, "class", "nav-link pl-0 svelte-ph1nu5");
    			add_location(a0, file$2, 86, 45, 2269);
    			attr_dev(li0, "class", "nav-item");
    			add_location(li0, file$2, 86, 24, 2248);
    			attr_dev(i1, "class", "fab fa-twitter fa-lg svelte-ph1nu5");
    			add_location(i1, file$2, 87, 73, 2420);
    			attr_dev(a1, "href", "");
    			attr_dev(a1, "class", "nav-link svelte-ph1nu5");
    			add_location(a1, file$2, 87, 45, 2392);
    			attr_dev(li1, "class", "nav-item");
    			add_location(li1, file$2, 87, 24, 2371);
    			attr_dev(i2, "class", "fas fa-check-circle fa-lg svelte-ph1nu5");
    			add_location(i2, file$2, 88, 73, 2539);
    			attr_dev(a2, "href", "");
    			attr_dev(a2, "class", "nav-link svelte-ph1nu5");
    			add_location(a2, file$2, 88, 45, 2511);
    			attr_dev(li2, "class", "nav-item");
    			add_location(li2, file$2, 88, 24, 2490);
    			attr_dev(i3, "class", "fab fa-instagram fa-lg svelte-ph1nu5");
    			add_location(i3, file$2, 89, 73, 2663);
    			attr_dev(a3, "href", "");
    			attr_dev(a3, "class", "nav-link svelte-ph1nu5");
    			add_location(a3, file$2, 89, 45, 2635);
    			attr_dev(li3, "class", "nav-item");
    			add_location(li3, file$2, 89, 24, 2614);
    			attr_dev(ul0, "class", "nav");
    			add_location(ul0, file$2, 85, 20, 2206);
    			add_location(br, file$2, 91, 20, 2757);
    			attr_dev(div1, "class", "row");
    			add_location(div1, file$2, 84, 16, 2168);
    			attr_dev(div2, "class", "col-md-4 order-md-first");
    			set_style(div2, "direction", "rtl");
    			add_location(div2, file$2, 81, 12, 1985);
    			attr_dev(i4, "class", "fas fa-link svelte-ph1nu5");
    			add_location(i4, file$2, 95, 45, 2934);
    			add_location(span0, file$2, 95, 73, 2962);
    			add_location(span1, file$2, 95, 90, 2979);
    			set_style(h51, "font-size", "30px");
    			add_location(h51, file$2, 95, 16, 2905);
    			attr_dev(a4, "href", "");
    			attr_dev(a4, "class", "svelte-ph1nu5");
    			add_location(a4, file$2, 99, 32, 3160);
    			add_location(li4, file$2, 99, 28, 3156);
    			attr_dev(a5, "href", "");
    			attr_dev(a5, "class", "svelte-ph1nu5");
    			add_location(a5, file$2, 100, 32, 3233);
    			add_location(li5, file$2, 100, 28, 3229);
    			attr_dev(a6, "href", "");
    			attr_dev(a6, "class", "svelte-ph1nu5");
    			add_location(a6, file$2, 101, 32, 3298);
    			add_location(li6, file$2, 101, 28, 3294);
    			attr_dev(a7, "href", "");
    			attr_dev(a7, "class", "svelte-ph1nu5");
    			add_location(a7, file$2, 102, 32, 3370);
    			add_location(li7, file$2, 102, 28, 3366);
    			attr_dev(ul1, "class", "list-unstyled");
    			add_location(ul1, file$2, 98, 24, 3101);
    			attr_dev(div3, "class", "col-6");
    			add_location(div3, file$2, 97, 20, 3057);
    			attr_dev(a8, "href", "");
    			attr_dev(a8, "class", "svelte-ph1nu5");
    			add_location(a8, file$2, 107, 32, 3591);
    			add_location(li8, file$2, 107, 28, 3587);
    			attr_dev(a9, "href", "");
    			attr_dev(a9, "class", "svelte-ph1nu5");
    			add_location(a9, file$2, 108, 32, 3662);
    			add_location(li9, file$2, 108, 28, 3658);
    			attr_dev(a10, "href", "");
    			attr_dev(a10, "class", "svelte-ph1nu5");
    			add_location(a10, file$2, 109, 32, 3728);
    			add_location(li10, file$2, 109, 28, 3724);
    			attr_dev(a11, "href", "");
    			attr_dev(a11, "class", "svelte-ph1nu5");
    			add_location(a11, file$2, 110, 32, 3796);
    			add_location(li11, file$2, 110, 28, 3792);
    			attr_dev(ul2, "class", "list-unstyled");
    			add_location(ul2, file$2, 106, 24, 3532);
    			attr_dev(div4, "class", "col-6");
    			add_location(div4, file$2, 105, 20, 3488);
    			attr_dev(div5, "class", "row");
    			add_location(div5, file$2, 96, 16, 3019);
    			attr_dev(div6, "class", "col-md-4 order-first order-md-last");
    			set_style(div6, "direction", "rtl");
    			add_location(div6, file$2, 94, 12, 2816);
    			attr_dev(div7, "class", "row");
    			add_location(div7, file$2, 66, 8, 1079);
    			attr_dev(div8, "class", "container");
    			add_location(div8, file$2, 65, 4, 1047);
    			attr_dev(footer, "class", "footer svelte-ph1nu5");
    			set_style(footer, "font-family", "'BYekan' ");
    			add_location(footer, file$2, 64, 0, 987);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, footer, anchor);
    			append_dev(footer, div8);
    			append_dev(div8, div7);
    			append_dev(div7, div0);
    			append_dev(div0, form);
    			append_dev(form, fieldset0);
    			append_dev(fieldset0, input);
    			append_dev(form, t0);
    			append_dev(form, fieldset1);
    			append_dev(fieldset1, textarea);
    			append_dev(form, t1);
    			append_dev(form, fieldset2);
    			append_dev(fieldset2, button);
    			append_dev(div7, t3);
    			append_dev(div7, div2);
    			append_dev(div2, h50);
    			append_dev(div2, t5);
    			append_dev(div2, hr);
    			append_dev(div2, t6);
    			append_dev(div2, div1);
    			append_dev(div1, ul0);
    			append_dev(ul0, li0);
    			append_dev(li0, a0);
    			append_dev(a0, i0);
    			append_dev(ul0, t7);
    			append_dev(ul0, li1);
    			append_dev(li1, a1);
    			append_dev(a1, i1);
    			append_dev(ul0, t8);
    			append_dev(ul0, li2);
    			append_dev(li2, a2);
    			append_dev(a2, i2);
    			append_dev(ul0, t9);
    			append_dev(ul0, li3);
    			append_dev(li3, a3);
    			append_dev(a3, i3);
    			append_dev(div1, t10);
    			append_dev(div1, br);
    			append_dev(div7, t11);
    			append_dev(div7, div6);
    			append_dev(div6, h51);
    			append_dev(h51, i4);
    			append_dev(h51, t12);
    			append_dev(h51, span0);
    			append_dev(h51, span1);
    			append_dev(div6, t15);
    			append_dev(div6, div5);
    			append_dev(div5, div3);
    			append_dev(div3, ul1);
    			append_dev(ul1, li4);
    			append_dev(li4, a4);
    			append_dev(ul1, t17);
    			append_dev(ul1, li5);
    			append_dev(li5, a5);
    			append_dev(ul1, t19);
    			append_dev(ul1, li6);
    			append_dev(li6, a6);
    			append_dev(ul1, t21);
    			append_dev(ul1, li7);
    			append_dev(li7, a7);
    			append_dev(div5, t23);
    			append_dev(div5, div4);
    			append_dev(div4, ul2);
    			append_dev(ul2, li8);
    			append_dev(li8, a8);
    			append_dev(ul2, t25);
    			append_dev(ul2, li9);
    			append_dev(li9, a9);
    			append_dev(ul2, t27);
    			append_dev(ul2, li10);
    			append_dev(li10, a10);
    			append_dev(ul2, t29);
    			append_dev(ul2, li11);
    			append_dev(li11, a11);

    			if (!mounted) {
    				dispose = listen_dev(window, "scroll", () => {
    					scrolling = true;
    					clearTimeout(scrolling_timeout);
    					scrolling_timeout = setTimeout(clear_scrolling, 100);
    					/*onwindowscroll*/ ctx[1]();
    				});

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 1 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window.pageXOffset, /*y*/ ctx[0]);
    				scrolling_timeout = setTimeout(clear_scrolling, 100);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(footer);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Footer", slots, []);
    	let { y } = $$props;
    	const writable_props = ["y"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(0, y = window.pageYOffset);
    	}

    	$$self.$$set = $$props => {
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    	};

    	$$self.$capture_state = () => ({ y });

    	$$self.$inject_state = $$props => {
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [y, onwindowscroll];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { y: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*y*/ ctx[0] === undefined && !("y" in props)) {
    			console.warn("<Footer> was created without expected prop 'y'");
    		}
    	}

    	get y() {
    		throw new Error("<Footer>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Footer>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const durationUnitRegex = /[a-zA-Z]/;
    const range = (size, startAt = 0) => [...Array(size).keys()].map(i => i + startAt);
    // export const characterRange = (startChar, endChar) =>
    //   String.fromCharCode(
    //     ...range(
    //       endChar.charCodeAt(0) - startChar.charCodeAt(0),
    //       startChar.charCodeAt(0)
    //     )
    //   );
    // export const zip = (arr, ...arrs) =>
    //   arr.map((val, i) => arrs.reduce((list, curr) => [...list, curr[i]], [val]));

    /* node_modules/svelte-loading-spinners/dist/Wave.svelte generated by Svelte v3.38.3 */
    const file$1 = "node_modules/svelte-loading-spinners/dist/Wave.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (48:2) {#each range(10, 0) as version}
    function create_each_block(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "bar svelte-8cmcz4");
    			set_style(div, "left", /*version*/ ctx[6] * (+/*size*/ ctx[3] / 5 + (+/*size*/ ctx[3] / 15 - +/*size*/ ctx[3] / 100)) + /*unit*/ ctx[1]);
    			set_style(div, "animation-delay", /*version*/ ctx[6] * (+/*durationNum*/ ctx[5] / 8.3) + /*durationUnit*/ ctx[4]);
    			add_location(div, file$1, 48, 4, 1193);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*size, unit*/ 10) {
    				set_style(div, "left", /*version*/ ctx[6] * (+/*size*/ ctx[3] / 5 + (+/*size*/ ctx[3] / 15 - +/*size*/ ctx[3] / 100)) + /*unit*/ ctx[1]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(48:2) {#each range(10, 0) as version}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let each_value = range(10, 0);
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "wrapper svelte-8cmcz4");
    			set_style(div, "--size", /*size*/ ctx[3] + /*unit*/ ctx[1]);
    			set_style(div, "--color", /*color*/ ctx[0]);
    			set_style(div, "--duration", /*duration*/ ctx[2]);
    			add_location(div, file$1, 44, 0, 1053);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*range, size, unit, durationNum, durationUnit*/ 58) {
    				each_value = range(10, 0);
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*size, unit*/ 10) {
    				set_style(div, "--size", /*size*/ ctx[3] + /*unit*/ ctx[1]);
    			}

    			if (dirty & /*color*/ 1) {
    				set_style(div, "--color", /*color*/ ctx[0]);
    			}

    			if (dirty & /*duration*/ 4) {
    				set_style(div, "--duration", /*duration*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Wave", slots, []);
    	
    	let { color = "#FF3E00" } = $$props;
    	let { unit = "px" } = $$props;
    	let { duration = "1.25s" } = $$props;
    	let { size = "60" } = $$props;
    	let durationUnit = duration.match(durationUnitRegex)[0];
    	let durationNum = duration.replace(durationUnitRegex, "");
    	const writable_props = ["color", "unit", "duration", "size"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Wave> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("unit" in $$props) $$invalidate(1, unit = $$props.unit);
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("size" in $$props) $$invalidate(3, size = $$props.size);
    	};

    	$$self.$capture_state = () => ({
    		range,
    		durationUnitRegex,
    		color,
    		unit,
    		duration,
    		size,
    		durationUnit,
    		durationNum
    	});

    	$$self.$inject_state = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("unit" in $$props) $$invalidate(1, unit = $$props.unit);
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("size" in $$props) $$invalidate(3, size = $$props.size);
    		if ("durationUnit" in $$props) $$invalidate(4, durationUnit = $$props.durationUnit);
    		if ("durationNum" in $$props) $$invalidate(5, durationNum = $$props.durationNum);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [color, unit, duration, size, durationUnit, durationNum];
    }

    class Wave extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { color: 0, unit: 1, duration: 2, size: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Wave",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get color() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get unit() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set unit(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/App.svelte generated by Svelte v3.38.3 */

    const { setTimeout: setTimeout_1 } = globals;
    const file = "src/App.svelte";

    // (27:0) {#if loading===true}
    function create_if_block_1(ctx) {
    	let div;
    	let wave;
    	let span;
    	let current;

    	wave = new Wave({
    			props: {
    				size: "100",
    				color: "green",
    				unit: "px",
    				duration: "1s"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(wave.$$.fragment);
    			span = element("span");
    			span.textContent = "لطفا کمی صبر کنید...";
    			attr_dev(span, "class", "loading-snipper");
    			add_location(span, file, 28, 66, 662);
    			set_style(div, "direction", "rtl");
    			set_style(div, "text-align", "center");
    			set_style(div, "margin", "auto");
    			set_style(div, "width", "100%");
    			set_style(div, "height", "100%");
    			add_location(div, file, 27, 1, 510);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(wave, div, null);
    			append_dev(div, span);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(wave.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(wave.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(wave);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(27:0) {#if loading===true}",
    		ctx
    	});

    	return block;
    }

    // (35:0) {#if loading===false}
    function create_if_block(ctx) {
    	let div;
    	let nav;
    	let t;
    	let footer;
    	let current;

    	nav = new Nav({
    			props: { y: /*y*/ ctx[0] },
    			$$inline: true
    		});

    	footer = new Footer({
    			props: { y: /*y*/ ctx[0] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(nav.$$.fragment);
    			t = space();
    			create_component(footer.$$.fragment);
    			attr_dev(div, "class", "class ");
    			add_location(div, file, 35, 0, 812);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(nav, div, null);
    			append_dev(div, t);
    			mount_component(footer, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const nav_changes = {};
    			if (dirty & /*y*/ 1) nav_changes.y = /*y*/ ctx[0];
    			nav.$set(nav_changes);
    			const footer_changes = {};
    			if (dirty & /*y*/ 1) footer_changes.y = /*y*/ ctx[0];
    			footer.$set(footer_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(nav.$$.fragment, local);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(nav.$$.fragment, local);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(nav);
    			destroy_component(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(35:0) {#if loading===false}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let scrolling = false;

    	let clear_scrolling = () => {
    		scrolling = false;
    	};

    	let scrolling_timeout;
    	let t;
    	let if_block1_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	add_render_callback(/*onwindowscroll*/ ctx[3]);
    	add_render_callback(/*onwindowresize*/ ctx[4]);
    	let if_block0 = /*loading*/ ctx[2] === true && create_if_block_1(ctx);
    	let if_block1 = /*loading*/ ctx[2] === false && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window, "scroll", () => {
    						scrolling = true;
    						clearTimeout(scrolling_timeout);
    						scrolling_timeout = setTimeout_1(clear_scrolling, 100);
    						/*onwindowscroll*/ ctx[3]();
    					}),
    					listen_dev(window, "resize", /*onwindowresize*/ ctx[4])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*y*/ 1 && !scrolling) {
    				scrolling = true;
    				clearTimeout(scrolling_timeout);
    				scrollTo(window.pageXOffset, /*y*/ ctx[0]);
    				scrolling_timeout = setTimeout_1(clear_scrolling, 100);
    			}

    			if (/*loading*/ ctx[2] === true) {
    				if (if_block0) {
    					if (dirty & /*loading*/ 4) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*loading*/ ctx[2] === false) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*loading*/ 4) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	let y = 0;
    	let x = 0;

    	//$: console.log(y);	
    	///
    	let loading = false;

    	setTimeout(
    		function () {
    			$$invalidate(2, loading = false);
    		},
    		2000
    	);

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function onwindowscroll() {
    		$$invalidate(0, y = window.pageYOffset);
    	}

    	function onwindowresize() {
    		$$invalidate(1, x = window.innerWidth);
    	}

    	$$self.$capture_state = () => ({
    		onMount,
    		Nav,
    		Footer,
    		fade,
    		slide,
    		scale,
    		fly,
    		Wave,
    		y,
    		x,
    		loading
    	});

    	$$self.$inject_state = $$props => {
    		if ("y" in $$props) $$invalidate(0, y = $$props.y);
    		if ("x" in $$props) $$invalidate(1, x = $$props.x);
    		if ("loading" in $$props) $$invalidate(2, loading = $$props.loading);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [y, x, loading, onwindowscroll, onwindowresize];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
