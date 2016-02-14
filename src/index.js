/**
 * Copyright (c) 2016 Shawn Dellysse
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const Group = function (cb) {
    this.Promise = Group.Promise;

    this.catchers = [];
    this.middlewares = {
        after: [],
        before: [],
    };
    this.items = [];

    if (cb != null) {
        cb(this);
    }
}

Object.assign(Group, {
    errors: {
        InvalidCatchError: require("./invalid-catch-error"),
        InvalidHandlerSpecificationError: require("./invalid-handler-specification-error"),
    },
    Promise: require("crystalize-promise").Promise,
});

Object.assign(Group.prototype, {
    // Attach a subgroup to this group. Path is optional.
    addGroup: function (path, group) {
        if (path instanceof Group && group == null) {
            return this.addGroup(null, path);
        }

        if (path != null && path.indexOf("/") !== 0) {
            throw new Group.errors.InvalidHandlerSpecificationError("path must either be null or start with /");
        }

        this.items.push({
            type: "group",

            path,
            group,
        });

        return this;
    },

    // addHandlers is used to connect a set of callbacks to a set of method/path
    // combinations.
    addHandler: function (methods, path, handler) {
        return this.addHandlers(methods, path, handler);
    },
    addHandlers: function (methods, path, ...handlers) {
        if (!Array.isArray(methods)) {
            if (methods == null) {
                return this.addHandlers([ ], path, handlers);
            } else {
                return this.addHandlers([ methods ], path, handlers);
            }
        }

        if (typeof path !== "string" || path.indexOf("/") !== 0) {
            throw new Group.errors.InvalidPathError(path);
            //throw new Group.errors.InvalidHandlerSpecificationError("path must be a string that starts with /");
        }
        if (methods.length === 0) {
            throw new Group.errors.InvalidMethodsError(methods);
            //throw new Group.errors.InvalidHandlerSpecificationError("Handler needs at least one method");
        }
        for (let method of methods) {
            if (typeof method !== "string" || method.trim().length === 0) {
                throw new Group.errors.InvalidMethodError(method);
            }
        }

        //throw new Group.errors.InvalidHandlerSpecificationError("Handler requires at least one callback or middleware object");
        if (!Array.isArray(handlers) || handlers.length === 0) {
            throw new Group.errors.InvalidHandlersError(handlers);
        }
        handlers = handlers.map(handler => {
            if (typeof handler === "function") {
                handler = {
                    name: null,
                    respondsTo: "then",
                    callback: handler,
                };
            }
            for (let handler of handlers) {
                if (handler instanceof Group) {
                    throw new Group.errors.HandlerCannotBeGroupError(handler);
                    //throw new Group.errors.InvalidHandlerSpecificationError("Cannot use a group as a handler.");
                }
                if (handler.respondsTo !== "then" && handler.respondsTo !== "catch") {
                    throw new Group.errors.InvalidHandlerSpecificationError(`Invalid handler respondsTo: '${ handler.respondsTo }'`);
                }
            }

            return handler;
        });

        this.items.push({
            type: "handler",

            methods,
            path,
            handlers,
        });

        return this;
    },

    // Middlewares injected here will be ran after each set of route functions
    // for a handler in this group. These will be executed in order they were
    // added. First added will be first ran.
    after: function (middleware) {
        this.middlewares.after.push(middleware);

        return this;
    },

    // Middlewares injected here must support being "around" middlewares.
    // "around" middlewares have two parts, a before and an after. Ordering for
    // each of these follows their respective rules.
    around: function (middleware) {
        this.before(middleware.before);
        this.after(middleware.after);

        return this;
    },

    // Middlewares injected here will be ran before each set of route functions
    // for a handler in this group. These will be executed in the opposite order
    // they were added, the last added will be the first ran.
    before: function (middleware) {
        this.middlewares.before.unshift(middleware);

        return this;
    },

    // Each group has a series of error handlers, this function adds an error
    // handler to that list.
    catch: function (callback) {
        if (typeof callback !== "function") {
            throw new Group.errors.InvalidCatchError(typeof callback);
        }
        this.catchers.push(handler);

        return this;
    },

    // This generates a list of route objects from this group and any subgroups
    // it contains.
    collectRoutes: function () {
        const routes = [];
        const appendToRoutes = (route) => {
            routes.push({
                ...route,

                handlers: [
                    ...this.middlewares.before,
                    ...route.handlers,
                    ...this.middlewares.after,
                    ...this.catchers.map((catcher, i) => ({
                        name: `GroupCatcher_${ i }`,
                        respondsTo: "catch",
                        callback: catcher,
                    })),
                ],
            });
        };

        for (let item of this.items) {
            if (item.type === "group") {
                for (let subRoute of item.group.collectRoutes()) {
                    appendToRoutes({
                        ...subRoute,

                        path: `${ item.path || "" }${ subRoute.path }`,
                    });
                }
            } else if (item.type === "route") {
                appendToRoutes(item);
            } else {
                throw new Error(`Bad type: '${ item.type }'`);
            }
        }

        return routes;
    },

    delete: function (path, ...handlers) {
        return this.addHandlers("delete", path, ...handlers),
    },


    get: function (path, ...handlers) {
        return this.addHandlers("get", path, ...handlers),
    },

    group: function (path, cb) {
        if (typeof path === "function") {
            return this.group(null, path);
        }

        const group = new Group(cb);
        this.addGroup(path, group);

        return this;
    },

    patch: function (path, ...handlers) {
        return this.addHandlers("patch", path, ...handlers),
    },

    post: function (path, ...handlers) {
        return this.addHandlers("post", path, ...handlers),
    },

    put: function (path, ...handlers) {
        return this.addHandlers("put", path, ...handlers),
    },
});

module.exports = Group;
