/*

    A sample-based synthesizer based on multiple recordings of an acoustic guitarlele.  Note-handling is divided into "families" around a particular sample, with scaling hints for each
    note ("family member").  Each family contains at least 12 notes: six steps below the unscaled recording, the unscaled recording itself, and five steps above.  The relative scaling is as
    follows:


    0.707106781186548
    0.749153538438341
    0.7937005259841
    0.840896415253714
    0.890898718140339
    0.943874312681693
    1
    1.0594630943593
    1.12246204830937
    1.18920711500272
    1.25992104989487
    1.33483985417003


    As this instrument is based on the natural range of the guitar, it only supports from a note below the open E on a guitar (D#4, or note 63) to five steps above (D#8, or note 111).

    See https://en.wikipedia.org/wiki/MIDI_tuning_standard and https://www.inspiredacoustics.com/en/MIDI_note_numbers_and_center_frequencies for the formulas and frequency values
    used to refine this approach.


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
            else if (midiMessage.type === "noteOn" && midiMessage.velocity > 0) {
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

        // Vary the volume of playing notes so that we can support aftertouch.  Only stop the note if this isn't aftertouch.`
        if (that.isPlaying && midiMessage.velocity > 0) {
            that.gainNode.gain.value = guitarompler.note.gainFromVelocity(midiMessage.velocity);
        }
        else {
            if (that.isPlaying) {
                that.stopPlaying();
            }

            that.gainNode.gain.value = guitarompler.note.gainFromVelocity(midiMessage.velocity);

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


    fluid.defaults("guitarompler.noteHolder", {
        gradeNames: ["fluid.component"],
        noteGrade: "guitarompler.note",
        basePitch: 0,
        noteSources: [
            { offset: -6, speed: 0.707106781186548 },
            { offset: -5, speed: 0.749153538438341 },
            { offset: -4, speed: 0.7937005259841 },
            { offset: -3, speed: 0.840896415253714 },
            { offset: -2, speed: 0.890898718140339 },
            { offset: -1, speed: 0.943874312681693 },
            { offset: 0, speed: 1 },
            { offset: 1, speed: 1.0594630943593 },
            { offset: 2, speed: 1.12246204830937 },
            { offset: 3, speed: 1.18920711500272 },
            { offset: 4, speed: 1.25992104989487 },
            { offset: 5, speed: 1.33483985417003 }
        ],
        buffer: false,
        dynamicComponents: {
            "note": {
                type: "{guitarompler.noteHolder}.options.noteGrade",
                sources: "{guitarompler.noteHolder}.options.noteSources",
                options: {
                    basePitch: "{guitarompler.noteHolder}.options.basePitch",
                    offset: "{source}.offset",
                    speed: "{source}.speed",
                    buffer: "{guitarompler.noteHolder}.options.buffer"
                }
            }
        }
    });

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
        basePitch: 57
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

    // TODO: Extend the range of the bookend octaves, i.e. 440Hz and lower, 3520 and higher.
    fluid.defaults("guitarompler.3520NoteFamily", {
        gradeNames: ["guitarompler.noteFamily"],
        noteUrl: "./src/sounds/3520.wav",
        noteGrade: "guitarompler.3520Note",
        basePitch: 105
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
            allFamilyNotesCreated: {
                events: {
                    "220NotesCreated": "220NotesCreated",
                    "440NotesCreated": "440NotesCreated",
                    "880NotesCreated": "880NotesCreated",
                    "1760NotesCreated": "1760NotesCreated",
                    "3520NotesCreated": "3520NotesCreated"
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
        if (messageType && ["noteOn", "noteOff"].indexOf(messageType) !== -1) {
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
                            func: "{guitarompler.launcher}.events.note.fire"
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
