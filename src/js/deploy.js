// TODO: Discuss reconciling this with the docpad and fluid-sandbox approaches and generalising for reuse.
/* eslint-env node */
"use strict";
var fluid = require("infusion");
fluid.setLogging(true);

var guitarompler = fluid.registerNamespace("guitarompler");

var path = require("path");

var copy = require("recursive-copy");
var fs = require("fs");
var mkdirp = require("mkdirp");
var rimraf = require("rimraf");

fluid.registerNamespace("guitarompler.generator");

guitarompler.generator.makeBundle = function (that) {
    var resolvedBasePath = fluid.module.resolvePath(that.options.baseDir);
    var promises = [];

    if (fs.existsSync(that.options.targetDir)) {
        promises.push(function () {
            var existingDirCleanPromise = fluid.promise();
            rimraf(that.options.targetDir, function (error) {
                if (error) {
                    existingDirCleanPromise.reject(error);
                }
                else {
                    existingDirCleanPromise.resolve();
                }
            });

            return existingDirCleanPromise;
        });
    }

    promises.push(function () {
        var dirCreationPromise = fluid.promise();
        var mkdirpPromise = mkdirp(that.options.targetDir);
        mkdirpPromise.then(dirCreationPromise.resolve, dirCreationPromise.reject);
        return dirCreationPromise;
    });

    fluid.each(fluid.makeArray(that.options.bundle), function (singleItemPath) {
        var itemSrcPath = path.resolve(resolvedBasePath, singleItemPath);
        var itemDestPath = path.resolve(that.options.targetDir, singleItemPath);

        // Return a promise-returning function so that only one call will be in flight at a time.
        promises.push(function () {
            return copy(itemSrcPath, itemDestPath);
        });
    });

    var sequence = fluid.promise.sequence(promises);

    sequence.then(
        function () { fluid.log("Finished, output saved to '", that.options.targetDir, "'..."); },
        fluid.fail
    );

    return sequence;
};

fluid.defaults("guitarompler.generator", {
    gradeNames: ["fluid.component"],
    baseDir: "%guitarompler",
    targetDir: "/Users/duhrer/Source/projects/duhrer.github.io/demos/guitarompler",
    bundle: [
        "./node_modules/infusion/dist/infusion-all.js",
        "./node_modules/infusion/dist/infusion-all.js.map",

        "./node_modules/flocking-midi/src/core.js",
        "./node_modules/flocking-midi/src/receiver.js",
        "./node_modules/flocking-midi/src/connection.js",
        "./node_modules/flocking-midi/src/system.js",
        "./node_modules/flocking-midi/src/controller.js",

        "./node_modules/flocking/src/ui/selectbox/js/selectbox.js",

        "./node_modules/flocking-midi/src/ui/port-selector/js/port-selector.js",
        "./node_modules/flocking-midi/src/ui/port-selector/js/port-select-box.js",
        "./node_modules/flocking-midi/src/ui/connector-view/js/connector-view.js",
        "./node_modules/flocking-midi/src/ui/message-monitor-view/js/message-monitor-view.js",

        "./index.html",
        "./src"
    ],
    listeners: {
        "onCreate.createBundle": {
            funcName: "guitarompler.generator.makeBundle",
            args:     ["{that}"]
        }
    }
});

guitarompler.generator();
