/*

    A sample-based synthesizer based on multiple recordings of an acoustic guitarlele.  Note-handling is divided into
    "families" around a particular sample, with scaling hints for each note ("family member").  Each family contains at
    least 12 notes: six steps below the unscaled recording, the unscaled recording itself, and five steps above.  The
    relative scaling is based on the fact that the frequency doubles as it rises an octave.  The shifted frequency can
    be derived using the following pseudocode formula:

    shiftedFrequency = baseFrequency * (Math.pow(2, ( desiredPitch - basePitch) / 12))

    Although we can calculate the shiftedFrequency for any distance away from the base pitch, in practice we are limited
    by the implementation of WebAudio's AudioBufferSourceNode.playbackRate:

    https://webaudio.github.io/web-audio-api/#dom-audiobuffersourcenode-playbackrate

    That supports scaling between -3.4 and 3.4 times the original speed.  This means a note can be effectively scaled
    21 steps in each direction, as this corresponds to the highest scaling value (3.36) under 3.4.

    As the lowest recorded note corresponds to MIDI note 57 (A3), the lowest playable note is 36 (C2).  The highest
    recorded note corresponds to MIDI note 117 (A8), and we can scale that to the highest note supported by the MIDI
    standard, i.e. 127 (G9). Thus the overall range is 91 notes, or seven and a half octaves between C2 and G9.

    See https://en.wikipedia.org/wiki/MIDI_tuning_standard and https://www.inspiredacoustics.com/en/MIDI_note_numbers_and_center_frequencies
    for the formulas and frequency values used to refine this approach.

    The basic approach to sound loading and decoding was adapted from the blog post here:  https://www.html5rocks.com/en/tutorials/webaudio/intro/

    The MIDI message format is based on flocking-midi: https://github.com/continuing-creativity/flocking-midi

*/
(function (fluid) {
    "use strict";
    // Crude "poly-fill" for prefixing differences between browsers.
    window.AudioContext = window.AudioContext || window.webkitAudioContext;

    var guitarompler = fluid.registerNamespace("guitarompler");

    fluid.defaults("guitarompler.soundLoader", {
        gradeNames: ["fluid.component"],
        members: {
            context: false,
            buffer: false
        },
        events: {
            onSoundReady: null
        },
        listeners: {
            "onCreate.init": {
                funcName: "guitarompler.soundLoader.init",
                args: ["{that}"]
            }
        },
        invokers: {
            "decodeSound": {
                funcName: "guitarompler.soundLoader.decodeSound",
                args: ["{that}", "{arguments}.0"] // arraybuffer
            }
        }
    });

    guitarompler.soundLoader.init = function (that) {
        try {
            that.context = new AudioContext();
        }
        catch (e) {
            fluid.fail("Web Audio API is not supported in this browser");
        }

        guitarompler.soundLoader.loadSound(that);
    };

    guitarompler.soundLoader.loadSound = function (that) {
        if (that.context) {
            var request = new XMLHttpRequest();
            request.open("GET", that.options.soundUrl, true);
            request.responseType = "arraybuffer";
            request.onload = that.decodeSound;
            request.send();
        }
    };

    guitarompler.soundLoader.decodeSound = function (that, progressEvent) {
        var arraybuffer = fluid.get(progressEvent, "target.response");
        if (arraybuffer) {
            that.context.decodeAudioData(arraybuffer, function (decodedBuffer) {
                that.buffer = decodedBuffer;
                that.events.onSoundReady.fire(decodedBuffer);
            });
        }
    };

    fluid.defaults("guitarompler.note", {
        gradeNames: ["fluid.component"],
        basePitch: 69,
        baseFreq: 440,
        offset: 0,
        pitch: "@expand:fluid.add({that}.options.basePitch, {that}.options.offset)",
        speed: 1,
        buffer: false,
        members: {
            isPlaying: false,
            context: false,
            gainNode: false,
            source: false
        },
        invokers: {
            handleNoteMessage: {
                funcName: "guitarompler.note.handleMessage",
                args: ["{that}", "{arguments}.0"] // midiMessage
            },
            startPlaying: {
                funcName: "guitarompler.note.startPlaying",
                args: ["{that}", "{arguments}.0"] // midiMessage

            },
            stopPlaying: {
                funcName: "guitarompler.note.stopPlaying",
                args: ["{that}", "{arguments}.0"] // midiMessage

            }
        }
    });

    guitarompler.note.init = function (that) {
        try {
            that.context = new AudioContext();

            // Create a gain node to manage the volume
            that.gainNode = that.context.createGain();
        }
        catch (e) {
            fluid.fail("WebAudio API is not available.");
        }
    };

    guitarompler.note.handleMessage = function (that, midiMessage) {
        if (midiMessage.note === that.options.pitch) {
            if ((midiMessage.type === "noteOff" || midiMessage.velocity === 0) && that.isPlaying) {
                that.stopPlaying();
            }
            else if (midiMessage.type === "aftertouch" | (midiMessage.type === "noteOn" && midiMessage.velocity > 0)) {
                that.startPlaying(midiMessage);
            }
        }
        else {
            fluid.log("Ignoring message for note " + midiMessage.note + ", I can only play note " + that.options.pitch + ".");
        }
    };

    guitarompler.note.gainFromVelocity = function (velocity) {
        return velocity / 128;
    };

    guitarompler.note.startPlaying = function (that, midiMessage) {
        if (!that.context || !that.gainNode) {
            guitarompler.note.init(that);
        }

        var velocity = midiMessage.velocity | midiMessage.pressure;

        // Vary the volume of playing notes so that we can support aftertouch.  Only stop the note if this isn't aftertouch.`
        if (that.isPlaying && velocity > 0) {
            that.gainNode.gain.value = guitarompler.note.gainFromVelocity(velocity);
        }
        else {
            if (that.isPlaying) {
                that.stopPlaying();
            }

            that.gainNode.gain.value = guitarompler.note.gainFromVelocity(velocity);

            that.source = that.context.createBufferSource();
            that.source.buffer = that.options.buffer;

            // Connect the gain node to the destination.
            that.gainNode.connect(that.context.destination);

            // Connect the source to the gain node.
            that.source.connect(that.gainNode);

            // If we wanted to change the behaviour of repeated "on" notes, this will update `isPlaying` when the sound file finishes playing.
            // that.source.onended = function () {
            //     that.isPlaying = false;
            // };

            // Scale the pitch/speed based on that.options.speed.
            that.source.playbackRate.value = that.options.speed;
            that.source.start(0);
            that.isPlaying = true;
        }
    };

    guitarompler.note.speedFromOffset = function (offset) {
        return Math.pow(2, (offset / 12));
    };

    guitarompler.note.stopPlaying = function (that) {
        if (that.source) {
            that.source.stop();
            that.isPlaying = false;
        }
    };

    fluid.defaults("guitarompler.220Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 57
    });

    fluid.defaults("guitarompler.440Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 69
    });

    fluid.defaults("guitarompler.880Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 81
    });

    fluid.defaults("guitarompler.1760Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 93
    });

    fluid.defaults("guitarompler.3520Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 105
    });

    fluid.defaults("guitarompler.7040Note", {
        gradeNames: ["guitarompler.note"],
        basePitch: 117
    });


    fluid.defaults("guitarompler.noteHolder", {
        gradeNames: ["fluid.component"],
        noteGrade: "guitarompler.note",
        basePitch: 0,
        minOffset: -6,
        maxOffset: 5,
        noteSources: [
            { offset: -6},
            { offset: -5},
            { offset: -4},
            { offset: -3},
            { offset: -2},
            { offset: -1},
            { offset: 0},
            { offset: 1},
            { offset: 2},
            { offset: 3},
            { offset: 4},
            { offset: 5},
            { offset: 6},
            { offset: 7},
            { offset: 8},
            { offset: 9},
            { offset: 10}
        ],
        // TODO: Figure out a way to generate the sources more cleanly, this fails.
        // noteSources: "expand:guitarompler.noteHolder.generateNoteSources({that}.options.minOffset, {that}.options.maxOffset)",
        buffer: false,
        dynamicComponents: {
            "note": {
                type: "{guitarompler.noteHolder}.options.noteGrade",
                sources: "{guitarompler.noteHolder}.options.noteSources",
                options: {
                    basePitch: "{guitarompler.noteHolder}.options.basePitch",
                    offset: "{source}.offset",
                    speed: "@expand:guitarompler.note.speedFromOffset({source}.offset)",
                    buffer: "{guitarompler.noteHolder}.options.buffer"
                }
            }
        }
    });

    guitarompler.noteHolder.generateNoteSources = function (minOffset, maxOffset) {
        var noteSources = [];
        for (var a = minOffset; a <= maxOffset; a++) {
            noteSources.push({ offset: a});
        }
        return noteSources;
    };

    fluid.defaults("guitarompler.noteFamily", {
        gradeNames: ["fluid.component"],
        noteGrade: "guitarompler.note",
        basePitch: 0,
        events: {
            createNotes: null
        },
        components: {
            soundLoader: {
                type: "guitarompler.soundLoader",
                options: {
                    soundUrl: "{guitarompler.noteFamily}.options.noteUrl",
                    listeners: {
                        "onSoundReady.notifyParent": {
                            func: "{guitarompler.noteFamily}.events.createNotes.fire",
                            args: ["{arguments}.0"]
                        }
                    }
                }
            },
            noteHolder: {
                type: "guitarompler.noteHolder",
                createOnEvent: "{that}.events.createNotes",
                options: {
                    noteGrade: "{guitarompler.noteFamily}.options.noteGrade",
                    basePitch: "{guitarompler.noteFamily}.options.basePitch",
                    buffer: "{arguments}.0"
                }
            }
        }
    });

    fluid.defaults("guitarompler.220NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/220.wav",
        noteGrade: "guitarompler.220Note",
        basePitch: 57,
        components: {
            noteHolder: {
                options: {
                    minOffset: -21,
                    maxOffset:  5,
                    noteSources: [
                        { offset: -21},
                        { offset: -20},
                        { offset: -19},
                        { offset: -18},
                        { offset: -17},
                        { offset: -16},
                        { offset: -15},
                        { offset: -14},
                        { offset: -13},
                        { offset: -12},
                        { offset: -11},
                        { offset: -10},
                        { offset: -9},
                        { offset: -8},
                        { offset: -7},
                        { offset: -6},
                        { offset: -5},
                        { offset: -4},
                        { offset: -3},
                        { offset: -2},
                        { offset: -1},
                        { offset: 0},
                        { offset: 1},
                        { offset: 2},
                        { offset: 3},
                        { offset: 4},
                        { offset: 5}
                    ]
                }
            }
        }
    });

    fluid.defaults("guitarompler.440NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/440.wav",
        noteGrade: "guitarompler.440Note",
        basePitch: 69
    });

    fluid.defaults("guitarompler.880NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/880.wav",
        noteGrade: "guitarompler.880Note",
        basePitch: 81
    });

    fluid.defaults("guitarompler.1760NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/1760.wav",
        noteGrade: "guitarompler.1760Note",
        basePitch: 93

    });

    fluid.defaults("guitarompler.3520NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/3520.wav",
        noteGrade: "guitarompler.3520Note",
        basePitch: 105
    });

    fluid.defaults("guitarompler.7040NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/7040.wav",
        noteGrade: "guitarompler.7040Note",
        basePitch: 117,
        components: {
            noteHolder: {
                options: {
                    minOffset: -6,
                    maxOffset: 10,
                    noteSources: [
                        { offset: -6},
                        { offset: -5},
                        { offset: -4},
                        { offset: -3},
                        { offset: -2},
                        { offset: -1},
                        { offset: 0},
                        { offset: 1},
                        { offset: 2},
                        { offset: 3},
                        { offset: 4},
                        { offset: 5},
                        { offset: 6},
                        { offset: 7},
                        { offset: 8},
                        { offset: 9},
                        { offset: 10}
                    ]
                }
            }
        }
    });

    fluid.defaults("guitarompler.loom", {
        gradeNames: ["fluid.component"], // TODO: Make into a note receiver.
        members: {
            destinationByNote: "@expand:fluid.generate(128, false)"
        },
        events: {
            "220NotesCreated": null,
            "440NotesCreated": null,
            "880NotesCreated": null,
            "1760NotesCreated": null,
            "3520NotesCreated": null,
            "7040NotesCreated": null,
            allFamilyNotesCreated: {
                events: {
                    "220NotesCreated": "220NotesCreated",
                    "440NotesCreated": "440NotesCreated",
                    "880NotesCreated": "880NotesCreated",
                    "1760NotesCreated": "1760NotesCreated",
                    "3520NotesCreated": "3520NotesCreated",
                    "7040NotesCreated": "7040NotesCreated"
                }
            }
        },
        components: {
            "220Family": {
                type: "guitarompler.220NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.220NotesCreated.fire"
                        }
                    }
                }
            },
            "440Family": {
                type: "guitarompler.440NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.440NotesCreated.fire"
                        }
                    }
                }
            },
            "880Family": {
                type: "guitarompler.880NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.880NotesCreated.fire"
                        }
                    }
                }

            },
            "1760Family": {
                type: "guitarompler.1760NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.1760NotesCreated.fire"
                        }
                    }
                }

            },
            "3520Family": {
                type: "guitarompler.3520NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.3520NotesCreated.fire"
                        }
                    }
                }
            },
            "7040Family": {
                type: "guitarompler.7040NoteFamily",
                options: {
                    listeners: {
                        "createNotes.notifyParent": {
                            func: "{guitarompler.loom}.events.7040NotesCreated.fire"
                        }
                    }
                }
            }
        },
        listeners: {
            "allFamilyNotesCreated.wireDestinations": {
                funcName: "guitarompler.loom.wireDestinations",
                args: ["{that}"]
            }
        },
        invokers: {
            handleNoteMessage: {
                funcName: "guitarompler.loom.sendToDestination",
                args: ["{that}", "{arguments}.0"] // midiMessage
            }
        }
    });

    guitarompler.loom.sendToDestination = function (that, midiMessage) {
        var messageType = fluid.get(midiMessage, "type");
        if (messageType && ["noteOn", "noteOff", "aftertouch"].indexOf(messageType) !== -1) {
            var noteDestination = fluid.get(that, ["destinationByNote", midiMessage.note]);
            if (noteDestination) {
                noteDestination.handleNoteMessage(midiMessage);
            }
        }
    };

    guitarompler.loom.wireDestinations = function (that) {
        // Awful hack to force the query to wait until all notes are finished constructing.
        setTimeout(function () {
            var allNotes = fluid.queryIoCSelector(that, "guitarompler.note");
            fluid.each(allNotes, function (noteComponent) {
                var pitch = noteComponent.options.basePitch + noteComponent.options.offset;
                that.destinationByNote[pitch] = noteComponent;
            });
        }, 500);
    };

    fluid.defaults("guitarompler.launcher", {
        gradeNames: ["fluid.viewComponent"],
        selectors: {
            noteInput: ".note-input",
            startButton: ".start-button"
        },
        events: {
            actionTaken: null,
            note: null,
            aftertouch: null
        },
        components: {
            noteInput: {
                type: "flock.midi.connectorView",
                container: "{that}.dom.noteInput",
                options: {
                    portType: "input",
                    listeners: {
                        "aftertouch.notifyParent": {
                            func: "{guitarompler.launcher}.events.aftertouch.fire"
                        },
                        "note.notifyParent": {
                            func: "{guitarompler.launcher}.events.note.fire"
                        }
                    },
                    components: {
                        midiPortSelector: {
                            options: {
                                strings: {
                                    selectBoxLabel: "Note Input"
                                }
                            }
                        }
                    }
                }
            },
            loom: {
                type: "guitarompler.loom",
                createOnEvent: "{that}.events.actionTaken"
            }
        },
        listeners: {
            "onCreate.bindClick": {
                "this": "{that}.container",
                "method": "click",
                "args": ["{that}.events.actionTaken.fire"]
            },
            "note.sendMessage": {
                funcName: "guitarompler.launcher.handleNoteMessage",
                args: ["{that}", "{arguments}.0"] // midiMessage
            },
            "aftertouch.sendMessage": {
                funcName: "guitarompler.launcher.handleNoteMessage",
                args: ["{that}", "{arguments}.0"] // midiMessage
            }
        }
    });

    guitarompler.launcher.handleNoteMessage = function (that, midiMessage) {
        if (that.loom) {
            that.loom.handleNoteMessage(midiMessage);
        }
    };
})(fluid);
