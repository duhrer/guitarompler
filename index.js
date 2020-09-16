/* eslint-env node */
// The main file that is included when you run `require("guitarompler")`.
"use strict";
var fluid = require("infusion");
fluid.module.register("guitarompler", __dirname, require);
