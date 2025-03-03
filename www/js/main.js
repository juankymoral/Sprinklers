/*global $, Windows, MSApp, navigator, chrome, FastClick, StatusBar, networkinterface, links */
var isIEMobile = /IEMobile/.test(navigator.userAgent),
    isAndroid = /Android|\bSilk\b/.test(navigator.userAgent),
    isiOS = /iP(ad|hone|od)/.test(navigator.userAgent),
    isFireFoxOS = /^.*?\Mobile\b.*?\Firefox\b.*?$/m.test(navigator.userAgent),
    isWinApp = /MSAppHost/.test(navigator.userAgent),
    isOSXApp = isOSXApp || false,
    isChromeApp = typeof chrome === "object" && typeof chrome.storage === "object",
    // Small wrapper to handle Chrome vs localStorage usage
    storage = {
        get: function(query,callback) {
            callback = callback || function(){};

            if (isChromeApp) {
                chrome.storage.local.get(query,callback);
            } else {
                var data = {},
                    i;

                if (typeof query === "object") {
                    for (i in query) {
                        if (query.hasOwnProperty(i)) {
                            data[query[i]] = localStorage.getItem(query[i]);
                        }
                    }
                } else if (typeof query === "string") {
                    data[query] = localStorage.getItem(query);
                }

                callback(data);
            }
        },
        set: function(query,callback) {
            callback = callback || function(){};

            if (isChromeApp) {
                chrome.storage.local.set(query,callback);
            } else {
                var i;
                if (typeof query === "object") {
                    for (i in query) {
                        if (query.hasOwnProperty(i)) {
                            localStorage.setItem(i,query[i]);
                        }
                    }
                }

                callback(true);
            }
        },
        remove: function(query,callback) {
            callback = callback || function(){};

            if (isChromeApp) {
                chrome.storage.local.remove(query,callback);
            } else {
                var i;

                if (typeof query === "object") {
                    for (i in query) {
                        if (query.hasOwnProperty(i)) {
                            localStorage.removeItem(query[i]);
                        }
                    }
                } else if (typeof query === "string") {
                    localStorage.removeItem(query);
                }

                callback(true);
            }
        }
    },
    retryCount = 3,
    controller = {},
    switching = false,
    curr_183, curr_ip, curr_prefix, curr_auth, curr_pw, curr_wa, curr_session, curr_auth_user, curr_auth_pw, curr_local, language, deviceip, interval_id, timeout_id;

// Fix CSS for IE Mobile (Windows Phone 8)
if (isIEMobile) {
    insertStyle(".ui-toolbar-back-btn{display:none!important}ul{list-style: none !important;}@media(max-width:940px){.wicon{margin:-10px -10px -15px -15px !important}#forecast .wicon{position:relative;left:37.5px;margin:0 auto !important}}");
}

// Fix CSS for Chrome Web Store apps
if (isChromeApp) {
    insertStyle("html,body{overflow-y:scroll}");
}

// Prevent caching of AJAX requests on Android and Windows Phone devices
if (isAndroid) {
    $(this).ajaxStart(function(){
        try {
            navigator.app.clearCache();
        } catch (err) {}
    });
} else if (isIEMobile || isWinApp) {
    $.ajaxSetup({
        "cache": false
    });
} else if (isFireFoxOS) {
    // Allow cross domain AJAX requests in FireFox OS
    $.ajaxSetup({
      xhrFields: {
        mozSystem: true
      }
    });
}

// Redirect jQuery Mobile DOM manipulation to prevent error
if (isWinApp) {
    // Add link to privacy statement
    var settingsPane = Windows.UI.ApplicationSettings.SettingsPane.getForCurrentView();

    settingsPane.addEventListener("commandsrequested", function(eventArgs) {
        var applicationCommands = eventArgs.request.applicationCommands;
        var privacyCommand = new Windows.UI.ApplicationSettings.SettingsCommand("privacy", "Privacy Policy", function(){
            window.open("http://albahra.com/journal/privacy-policy");
        });
        applicationCommands.append(privacyCommand);
    });

    // Cache the old domManip function.
    $.fn.oldDomManIp = $.fn.domManip;
    // Override the domManip function with a call to the cached domManip function wrapped in a MSapp.execUnsafeLocalFunction call.
    $.fn.domManip = function (args, callback, allowIntersection) {
        var that = this;
        return MSApp.execUnsafeLocalFunction(function () {
            return that.oldDomManIp(args, callback, allowIntersection);
        });
    };
}

$(document)
.ready(initApp)
.one("deviceready", function() {
    try {
        //Change the status bar to match the headers
        StatusBar.overlaysWebView(false);
        StatusBar.styleLightContent();
        StatusBar.backgroundColorByHexString("#1D1D1D");
    } catch (err) {}

    // Hide the splash screen
    setTimeout(function(){
        try {
            navigator.splashscreen.hide();
        } catch(err) {}
    },500);

    // Check if device is on a local network
    checkAutoScan();

    // For Android, Blackberry and Windows Phone devices catch the back button and redirect it
    $.mobile.document.on("backbutton",function(){
        if (isIEMobile && $.mobile.document.data("iabOpen")) {
            return false;
        }
        goBack();
        return false;
    });
})
.one("mobileinit", function(){
    //After jQuery mobile is loaded set intial configuration
    $.mobile.defaultPageTransition = "fade";
    $.mobile.hoverDelay = 0;
    $.mobile.hashListeningEnabled = false;

    //Change history method for Chrome Packaged Apps
    if (isChromeApp) {
        $.mobile.document.on("click",".ui-toolbar-back-btn",function(){
            goBack();
            return false;
        });
    }

    //Use system browser for links on iOS and Windows Phone
    if (isiOS) {
        $.mobile.document.on("click",".iab",function(){
            var button = $(this);
            window.open(button.attr("href"),"_blank","location=no,enableViewportScale=yes,toolbarposition=top,closebuttoncaption="+_("Done"));
            setTimeout(function(){
                button.removeClass("ui-btn-active");
            },100);
            return false;
        });
    } else if (isIEMobile) {
        $.mobile.document.on("click",".iab",function(){
            var iab = window.open(this.href,"_blank","enableViewportScale=yes");

            $.mobile.document.data("iabOpen",true);
            iab.addEventListener("exit",function(){
                $.mobile.document.removeData("iabOpen");
            });
            return false;
        });
    } else if (isAndroid) {
        $.mobile.document.on("click",".iab",function(){
            window.open(this.href,"_blank","enableViewportScale=yes");
            return false;
        });
    }
})
.one("pagebeforechange", function(event) {
    // Let the framework know we're going to handle the first load
    event.preventDefault();

    // Bind the event handler for subsequent pagebeforechange requests
    $.mobile.document.on("pagebeforechange",function(e,data){
        var page = data.toPage,
            currPage = $(".ui-page-active"),
            hash;

        // Pagebeforechange event triggers twice (before and after) and this check ensures we get the before state
        if (typeof data.toPage !== "string") {
            return;
        }

        hash = $.mobile.path.parseUrl(page).hash;

        if (hash === "#"+currPage.attr("id") && (hash === "#programs" || hash === "#site-control")) {
            // Cancel page load when navigating to the same page
            e.preventDefault();

            // Allow pages to navigate back by adjusting active index in history
            $.mobile.navigate.history.activeIndex--;

            // Remove the current page from the DOM
            currPage.remove();

            // Change to page without any animation or history change
            changePage(hash,{
                transition: "none",
                showLoadMsg: false,
                showBack: data.options.showBack
            });
            return;
        }

        // Animations are patchy if the page isn't scrolled to the top. This scrolls the page before the animation fires off
        if (data.options.role !== "popup" && !$(".ui-popup-active").length) {
            $.mobile.silentScroll(0);
        }

        // Cycle through page possbilities and call their init functions
        if (hash === "#programs") {
            get_programs(data.options.programToExpand);
        } else if (hash === "#addprogram") {
            add_program();
        } else if (hash === "#status") {
            get_status();
        } else if (hash === "#manual") {
            get_manual();
        } else if (hash === "#about") {
            show_about();
        } else if (hash === "#runonce") {
            get_runonce();
        } else if (hash === "#os-options") {
            show_options();
        } else if (hash === "#preview") {
            get_preview();
        } else if (hash === "#logs") {
            get_logs();
        } else if (hash === "#start") {
            checkAutoScan();
        } else if (hash === "#os-stations") {
            show_stations();
        } else if (hash === "#site-control") {
            show_sites(data.options.showBack);
        } else if (hash === "#weather_settings") {
            show_weather_settings();
        } else if (hash === "#addnew") {
            show_addnew();
            return false;
        } else if (hash === "#raindelay") {
            $(hash).find("form").on("submit",raindelay);
        } else if (hash === "#site-select") {
            show_site_select();
            return false;
        } else if (hash === "#sprinklers") {
            if (!data.options.firstLoad) {
                //Reset status bar to loading while an update is done
                showLoading("#footer-running");
                setTimeout(function(){
                    refresh_status();
                },800);
            } else {
                check_status();
            }
        } else if (hash === "#settings") {
            show_settings();
        }
    });

    //On initial load check if a valid site exists for auto connect
    check_configured(true);

    //Attach FastClick handler
    FastClick.attach(document.body);
})
// Handle OS resume event triggered by PhoneGap
.on("resume",function(){
    var page = $(".ui-page-active").attr("id"),
        func = function(){};

    // Check if device is still on a local network
    checkAutoScan();

    // If we don't have a current device IP set, there is nothing else to update
    if (curr_ip === undefined) {
        return;
    }

    // Indicate the weather and device status are being updated
    showLoading("#weather,#footer-running");

    if (page === "status") {
        // Update the status page
        func = get_status;
    } else if (page === "sprinklers") {
        // Update device status bar on main page
        func = check_status;
    }

    update_controller(function(){
        func();
        update_weather();
    },network_fail);
})
.on("pause",function(){
    //Remove any status timers that may be running
    removeTimers();
})
.on("pageshow",function(e){
    var newpage = "#"+e.target.id,
        $newpage = $(newpage);

    // Fix issues between jQuery Mobile and FastClick
    fixInputClick($newpage);

    if (newpage === "#sprinklers") {
        // Bind event handler to open panel when swiping on the main page
        $newpage.off("swiperight").on("swiperight", function() {
            if ($(".ui-page-active").jqmData("panel") !== "open" && !$(".ui-page-active .ui-popup-active").length) {
                open_panel();
            }
        });
    }
})
.on("popupafteropen",function(){
    if ($(".ui-overlay-b:not(.ui-screen-hidden)").length) {
        try {
            StatusBar.backgroundColorByHexString("#202020");
        } catch (err) {}
    }
})
.on("popupafterclose",function(){
    try {
        StatusBar.backgroundColorByHexString("#1D1D1D");
    } catch (err) {}
})
.on("pagehide","#start",removeTimers)
.on("popupbeforeposition","#localization",check_curr_lang);

//Set AJAX timeout
$.ajaxSetup({
    timeout: 6000
});

function initApp() {
    //Update the language on the page using the browser's locale
    update_lang();

    //Update site based on selector
    $("#site-selector").on("change",function(){
        update_site($(this).val());
    });

    //Bind start page buttons
    $("#auto-scan").find("a").on("click",function(){
        start_scan();
        return false;
    });

    //Bind open panel button
    $("#sprinklers").find("div[data-role='header'] > .ui-btn-left").on("click",function(){
        open_panel();
        return false;
    });

    //Bind stop all stations button
    $("#stop-all").on("click",function(){
        areYouSure(_("Are you sure you want to stop all stations?"), "", function() {
            $.mobile.loading("show");
            send_to_os("/cv?pw=&rsn=1").done(function(){
                $.mobile.loading("hide");
                $.when(
                    update_controller_settings(),
                    update_controller_status()
                ).then(check_status);
                showerror(_("All stations have been stopped"));
            });
        });
    });

    //When app isn't using cordova.js, check network status now
    if (isChromeApp || isOSXApp) {
        checkAutoScan();
    }
}

// Handle main switches for manual mode and enable
function flipSwitched() {
    if (switching) {
        return;
    }

    //Find out what the switch was changed to
    var flip = $(this),
        id = flip.attr("id"),
        changedTo = flip.is(":checked"),
        method = (id === "mmm") ? "mm" : id,
        defer;

    if (changedTo) {
        defer = send_to_os("/cv?pw=&"+method+"=1");
    } else {
        defer = send_to_os("/cv?pw=&"+method+"=0");
    }

    $.when(defer).then(function(){
        update_controller_settings();
        update_controller_status();
        if (id === "mmm") {
            $("#mm_list .green").removeClass("green");
        }
    },
    function(){
        switching = true;
        setTimeout(function(){
            switching = false;
        },200);
        flip.prop("checked",!changedTo).flipswitch("refresh");
    });
}

// Wrapper function to communicate with OpenSprinkler
function send_to_os(dest,type) {
    // Inject password into the request
    dest = dest.replace("pw=","pw="+encodeURIComponent(curr_pw));
    type = type || "text";
    var obj = {
        url: curr_prefix+curr_ip+dest,
        type: "GET",
        dataType: type
    };

    if (curr_auth) {
        $.extend(obj,{
            beforeSend: function(xhr) { xhr.setRequestHeader("Authorization", "Basic " + btoa(curr_auth_user + ":" + curr_auth_pw)); }
        });
    }

    if (typeof curr_session !== "undefined") {
        $.extend(obj,{
            beforeSend: function(xhr) { xhr.setRequestHeader("webpy_session_id", curr_session); }
        });
    }

    return $.ajax(obj).retry({times:retryCount, statusCodes: [0,408,500]}).fail(function(e){
        if (e.statusText==="timeout" || e.status===0) {
            showerror(_("Connection timed-out. Please try again."));
        } else if (e.status===401 && /\/(?:cv|cs|cr|cp|uwa|dp|co|cl|cu)/.exec(dest)) {
            showerror(_("Check device password and try again."));
        }
        return;
    });
}

function network_fail(){
    change_status(0,0,"red","<p id='running-text' class='center'>"+_("Network Error")+"</p>",function(){
        showLoading("#weather,#footer-running");
        refresh_status();
        update_weather();
    });
    hide_weather();
}

// Gather new controller information and load home page
function newload() {
    var name = $("#site-selector").val();

    $.mobile.loading("show", {
        text: curr_local ? _("Loading") : _("Connecting to")+" "+name,
        textVisible: true,
        textonly: curr_local ? true : false,
        theme: "b"
    });

    //Empty object which will store device data
    controller = {};
    update_controller(
        function(){
            var log_button = $("#log_button"),
                clear_logs = $(".clear_logs"),
                change_password = $(".change_password");

            $.mobile.loading("hide");
            check_status();
            update_weather();

            // Hide log viewer button on home page if not supported
            if ((typeof controller.options.fwv === "number" && controller.options.fwv < 206) || (typeof controller.options.fwv === "string" && controller.options.fwv.match(/1\.9\.0/)) === -1) {
                log_button.hide();
            } else {
                log_button.css("display","");
            }

            // Hide clear logs button when using Arduino device (feature not enabled yet)
            if (typeof controller.options.fwv === "number" && controller.options.fwv < 210) {
                clear_logs.hide();
            } else {
                clear_logs.css("display","");
            }

            // Hide change password feature for unsupported devices
            if (typeof controller.options.fwv === "number" && controller.options.fwv < 208) {
                change_password.hide();
            } else {
                change_password.css("display","");
            }

            // Update export to email button in side panel
            objToEmail(".email_config",controller);

            // Check if automatic rain delay plugin is enabled on OSPi devices
            checkWeatherPlugin();

            // Transition to home page after succesful load
            if ($.mobile.pageContainer.pagecontainer("getActivePage").attr("id") !== "sprinklers") {
                $.mobile.document.one("pageshow",function(){
                    // Allow future transitions to properly animate
                    delete $.mobile.navigate.history.getActive().transition;
                });
                changePage("#sprinklers",{
                    "transition":"none",
                    "firstLoad": true
                });
            }
        },
        function(){
            changePage("#site-control",{"showBack": false});
        }
    );
}

// Update controller information
function update_controller(callback,fail) {
    callback = callback || function(){};
    fail = fail || function(){};

    $.when(
        update_controller_programs(),
        update_controller_stations(),
        update_controller_options(),
        update_controller_status(),
        update_controller_settings()
    ).then(callback,fail);
}

function update_controller_programs(callback) {
    callback = callback || function(){};

    if (curr_183 === true) {
        return send_to_os("/gp?d=0").done(function(programs){
            var vars = programs.match(/(nprogs|nboards|mnp)=[\w|\d|.\"]+/g),
                progs = /pd=\[\];(.*);/.exec(programs),
                newdata = {}, tmp, prog;

            for (var i=0; i<vars.length; i++) {
                if (vars[i] === "") {
                    continue;
                }
                tmp = vars[i].split("=");
                newdata[tmp[0]] = parseInt(tmp[1]);
            }

            newdata.pd = [];
            if (progs !== null) {
                progs = progs[1].split(";");
                for (i=0; i<progs.length; i++) {
                    prog = progs[i].split("=");
                    prog = prog[1].replace("[", "");
                    prog = prog.replace("]", "");
                    newdata.pd[i] = parseIntArray(prog.split(","));
                }
            }

            controller.programs = newdata;
            callback();
        });
    } else {
        return send_to_os("/jp","json").done(function(programs){
            controller.programs = programs;
            callback();
        });
    }
}

function update_controller_stations(callback) {
    callback = callback || function(){};

    if (curr_183 === true) {
        return send_to_os("/vs").done(function(stations){
            var names = /snames=\[(.*?)\];/.exec(stations),
                masop = stations.match(/(?:masop|mo)\s?[=|:]\s?\[(.*?)\]/);

            names = names[1].split(",");
            names.pop();

            for (var i=0; i<names.length; i++) {
                names[i] = names[i].replace(/'/g,"");
            }

            masop = parseIntArray(masop[1].split(","));

            controller.stations = {
                "snames": names,
                "masop": masop,
                "maxlen": names.length
            };
            callback();
        });
    } else {
        return send_to_os("/jn","json").done(function(stations){
            controller.stations = stations;
            callback();
        });
    }
}

function update_controller_options(callback) {
    callback = callback || function(){};

    if (curr_183 === true) {
        return send_to_os("/vo").done(function(options){
            var isOSPi = options.match(/var sd\s*=/),
                vars = {}, tmp, i, o;

            if (isOSPi) {
                var varsRegex = /(tz|htp|htp2|nbrd|seq|sdt|mas|mton|mtoff|urs|rst|wl|ipas)\s?[=|:]\s?([\w|\d|.\"]+)/gm,
                    name;

                while ((tmp = varsRegex.exec(options)) !== null) {
                    name = tmp[1].replace("nbrd","ext").replace("mtoff","mtof");
                    vars[name] = +tmp[2];
                }
                vars.ext--;
                vars.fwv = "1.8.3-ospi";
            } else {
                var keyIndex = {1:"tz",2:"ntp",12:"hp0",13:"hp1",14:"ar",15:"ext",16:"seq",17:"sdt",18:"mas",19:"mton",20:"mtof",21:"urs",22:"rso",23:"wl",25:"ipas",26:"devid"};
                tmp = /var opts=\[(.*)\];/.exec(options);
                tmp = tmp[1].replace(/"/g,"").split(",");

                for (i=0; i<tmp.length-1; i=i+4) {
                    o = +tmp[i+3];
                    if ($.inArray(o,[1,2,12,13,14,15,16,17,18,19,20,21,22,23,25,26]) !== -1) {
                        vars[keyIndex[o]] = +tmp[i+2];
                    }
                }
                vars.fwv = 183;
            }
            controller.options = vars;
            callback();
        });
    } else {
        return send_to_os("/jo","json").done(function(options){
            controller.options = options;
            callback();
        });
    }
}

function update_controller_status(callback) {
    callback = callback || function(){};

    if (curr_183 === true) {
        return send_to_os("/sn0").then(
            function(status){
                var tmp = status.match(/\d+/);

                tmp = parseIntArray(tmp[0].split(""));

                controller.status = tmp;
                callback();
            },
            function(){
                controller.status = [];
            });
    } else {
        return send_to_os("/js","json").then(
            function(status){
                controller.status = status.sn;
                callback();
            },
            function(){
                controller.status = [];
            });
    }
}

function update_controller_settings(callback) {
    callback = callback || function(){};

    if (curr_183 === true) {
        return send_to_os("").then(
            function(settings){
                var varsRegex = /(ver|devt|nbrd|tz|en|rd|rs|mm|rdst|urs)\s?[=|:]\s?([\w|\d|.\"]+)/gm,
                    loc = settings.match(/loc\s?[=|:]\s?[\"|'](.*)[\"|']/),
                    lrun = settings.match(/lrun=\[(.*)\]/),
                    ps = settings.match(/ps=\[(.*)\];/),
                    vars = {}, tmp, i;

                ps = ps[1].split("],[");
                for (i = ps.length - 1; i >= 0; i--) {
                    ps[i] = parseIntArray(ps[i].replace(/\[|\]/g,"").split(","));
                }

                while ((tmp = varsRegex.exec(settings)) !== null) {
                    vars[tmp[1]] = +tmp[2];
                }

                vars.loc = loc[1];
                vars.ps = ps;
                vars.lrun = parseIntArray(lrun[1].split(","));

                controller.settings = vars;
            },
            function(){
                if (controller.settings && controller.stations) {
                    var ps = [], i;
                    for (i=0; i<controller.stations.maxlen; i++) {
                        ps.push([0,0]);
                    }
                    controller.settings.ps = ps;
                }
            });
    } else {
        return send_to_os("/jc","json").then(
            function(settings){
                controller.settings = settings;
                callback();
            },
            function(){
                if (controller.settings && controller.stations) {
                    var ps = [], i;
                    for (i=0; i<controller.stations.maxlen; i++) {
                        ps.push([0,0]);
                    }
                    controller.settings.ps = ps;
                }
            });
    }
}

// Multisite functions
function check_configured(firstLoad) {
    storage.get(["sites","current_site"],function(data){
        var sites = data.sites,
            current = data.current_site,
            names;

        try {
            sites = JSON.parse(sites) || {};
        } catch(e) {
            sites = {};
        }

        names = Object.keys(sites);

        if (!names.length) {
            if (firstLoad) {
                changePage("#start");
            }
            return;
        }

        if (current === null || !(current in sites)) {
            $.mobile.loading("hide");
            changePage("#site-control",{"showBack": false});
            return;
        }

        update_site_list(names,current);

        curr_ip = sites[current].os_ip;
        curr_pw = sites[current].os_pw;

        if (typeof sites[current].ssl !== "undefined" && sites[current].ssl === "1") {
            curr_prefix = "https://";
        } else {
            curr_prefix = "http://";
        }

        if (typeof sites[current].auth_user !== "undefined" && typeof sites[current].auth_pw !== "undefined") {
            curr_auth = true;
            curr_auth_user = sites[current].auth_user;
            curr_auth_pw = sites[current].auth_pw;
        } else {
            curr_auth = false;
        }

        if (sites[current].is183) {
            curr_183 = true;
        } else {
            curr_183 = false;
        }

        newload();
    });
}

// Add a new site
function submit_newuser(ssl,useAuth) {
    document.activeElement.blur();
    $.mobile.loading("show");

    var ip = $("#os_ip").val(),
        success = function(data,sites){
            $.mobile.loading("hide");
            var is183;

            if (typeof data === "string" && data.match(/var (en|sd)\s*=/)) {
                is183 = true;
            }

            if (data.fwv !== undefined || is183 === true) {
                var name = $("#os_name").val(),
                    ip = $("#os_ip").val().replace(/^https?:\/\//,"");

                if (name === "") {
                    name = "Site "+(Object.keys(sites).length+1);
                }

                sites[name] = {};
                sites[name].os_ip = curr_ip = ip;
                sites[name].os_pw = curr_pw = $("#os_pw").val();

                if (ssl) {
                    sites[name].ssl = "1";
                    curr_prefix = "https://";
                } else {
                    curr_prefix = "http://";
                }

                if (useAuth) {
                    sites[name].auth_user = $("#os_auth_user").val();
                    sites[name].auth_pw = $("#os_auth_pw").val();
                    curr_auth = true;
                    curr_auth_user = sites[name].auth_user;
                    curr_auth_pw = sites[name].auth_pw;
                } else {
                    curr_auth = false;
                }

                if (is183 === true) {
                    sites[name].is183 = "1";
                    curr_183 = true;
                }

                $("#os_name,#os_ip,#os_pw,#os_auth_user,#os_auth_pw").val("");
                storage.set({
                    "sites": JSON.stringify(sites),
                    "current_site": name
                },function(){
                    update_site_list(Object.keys(sites),name);
                    newload();
                });
            } else {
                showerror(_("Check IP/Port and try again."));
            }
        },
        fail = function (x){
            if (!useAuth && x.status === 401) {
                getAuth();
                return;
            }
            if (ssl) {
                $.mobile.loading("hide");
                showerror(_("Check IP/Port and try again."));
            } else {
                submit_newuser(true);
            }
        },
        getAuth = function(){
            if ($("#addnew-auth").length) {
                submit_newuser(ssl,true);
            } else {
                showAuth();
            }
        },
        showAuth = function(){
            $.mobile.loading("hide");
            var html = $("<div class='ui-content' id='addnew-auth'>" +
                    "<form method='post' novalidate>" +
                        "<p class='center smaller'>"+_("Authorization Required")+"</p>" +
                        "<label for='os_auth_user'>"+_("Username:")+"</label>" +
                        "<input autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' type='text' name='os_auth_user' id='os_auth_user' />" +
                        "<label for='os_auth_pw'>"+_("Password:")+"</label>" +
                        "<input type='password' name='os_auth_pw' id='os_auth_pw' />" +
                        "<input type='submit' value='"+_("Submit")+"' />" +
                    "</form>" +
                "</div>").enhanceWithin();

            html.on("submit","form",function(){
                submit_newuser(ssl,true);
                return false;
            });

            $("#addnew-content").hide();
            $("#addnew").append(html).popup("reposition",{positionTo:"window"});
        },
        prefix;

    if (!ip) {
        showerror(_("An IP address is required to continue."));
        return;
    }

    if (useAuth !== true && $("#os_useauth").is(":checked")) {
        getAuth();
        return;
    }

    if ($("#os_usessl").is(":checked") === true) {
        ssl = true;
    }

    if (ssl) {
        prefix = "https://";
    } else {
        prefix = "http://";
    }

    if (useAuth) {
        $("#addnew-auth").hide();
        $("#addnew-content").show();
        $("#addnew").popup("reposition",{positionTo:"window"});
    }

    //Submit form data to the server
    $.ajax({
        url: prefix+ip+"/jo",
        type: "GET",
        dataType: "json",
        timeout: 3000,
        global: false,
        beforeSend: function(xhr) {
            if (useAuth) {
                xhr.setRequestHeader("Authorization", "Basic " + btoa($("#os_auth_user").val() + ":" + $("#os_auth_pw").val()));
            }
        },
        error: function(x){
            if (!useAuth && x.status === 401) {
                getAuth();
                return;
            }
            $.ajax({
                url: prefix+ip,
                type: "GET",
                dataType: "text",
                timeout: 3000,
                global: false,
                beforeSend: function(xhr) {
                    if (useAuth) {
                        xhr.setRequestHeader("Authorization", "Basic " + btoa($("#os_auth_user").val() + ":" + $("#os_auth_pw").val()));
                    }
                },
                success: function(reply){
                    storage.get("sites",function(data){
                        var sites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites);
                        success(reply,sites);
                    });
                },
                error: fail
            });
        },
        success: function(reply){
            storage.get("sites",function(data){
                var sites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites);
                success(reply,sites);
            });
        }
    });
}

function show_site_select(list) {
    $("#site-select").popup("destroy").remove();

    var popup = $("<div data-role='popup' id='site-select' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>"+_("Select Site")+"</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<ul data-role='none' class='ui-listview ui-corner-all ui-shadow'>" +
                "</ul>" +
            "</div>" +
        "</div>");

    if (list) {
        popup.find("ul").html(list);
    }

    popup.one("popupafterclose",function(){
        $(this).popup("destroy").remove();
    }).popup({
        history: false,
        "positionTo": "window"
    }).enhanceWithin().popup("open");
}

function show_addsite() {
    if (typeof deviceip === "undefined") {
        show_addnew();
    } else {
        var popup = $("#addsite");

        $("#site-add-scan").one("click",function(){
            $(".ui-popup-active").children().first().popup("close");
        });

        popup.popup("open").popup("reposition",{
            "positionTo": "#site-add"
        });
    }
}

function show_addnew(autoIP,closeOld) {
    $("#addnew").popup("destroy").remove();

    var isAuto = (autoIP) ? true : false,
        addnew = $("<div data-role='popup' id='addnew' data-theme='a'>"+
            "<div data-role='header' data-theme='b'>"+
                "<h1>"+_("New Device")+"</h1>" +
            "</div>" +
            "<div class='ui-content' id='addnew-content'>" +
                "<form method='post' novalidate>" +
                    ((isAuto) ? "" : "<p class='center smaller'>"+_("Note: The name is used to identify the OpenSprinkler within the app. OpenSprinkler IP can be either an IP or hostname. You can also specify a port by using IP:Port")+"</p>") +
                    "<label for='os_name'>"+_("Open Sprinkler Name:")+"</label>" +
                    "<input autocorrect='off' spellcheck='false' type='text' name='os_name' id='os_name' placeholder='Home' />" +
                    ((isAuto) ? "" : "<label for='os_ip'>"+_("Open Sprinkler IP:")+"</label>") +
                    "<input "+((isAuto) ? "data-role='none' style='display:none' " : "")+"autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' type='url' name='os_ip' id='os_ip' value='"+((isAuto) ? autoIP : "")+"' placeholder='home.dyndns.org' />" +
                    "<label for='os_pw'>"+_("Open Sprinkler Password:")+"</label>" +
                    "<input type='password' name='os_pw' id='os_pw' value='' />" +
                    ((isAuto) ? "" : "<div data-theme='a' data-mini='true' data-role='collapsible'><h4>Advanced</h4><fieldset data-role='controlgroup' data-type='horizontal' data-mini='true' class='center'>" +
                        "<input type='checkbox' name='os_useauth' id='os_useauth'>" +
                        "<label for='os_useauth'>"+_("Use Auth")+"</label>" +
                        "<input type='checkbox' name='os_usessl' id='os_usessl'>" +
                        "<label for='os_usessl'>"+_("Use SSL")+"</label>" +
                    "</fieldset></div>") +
                    "<input type='submit' data-theme='b' value='"+_("Submit")+"' />" +
                "</form>" +
            "</div>" +
        "</div>");

    addnew.find("form").on("submit",function(){
        submit_newuser();
        return false;
    });

    addnew.one("popupafterclose",function(){
        $(this).popup("destroy").remove();
    }).popup({
        history: false,
        "positionTo": "window"
    }).enhanceWithin();

    if (closeOld) {
        $(".ui-popup-active").children().first().one("popupafterclose",function(){
            addnew.popup("open");
        }).popup("close");
    } else {
        addnew.popup("open");
    }

    fixInputClick(addnew);

    addnew.find(".ui-collapsible-heading-toggle").on("click",function(){
        var open = $(this).parents(".ui-collapsible").hasClass("ui-collapsible-collapsed"),
            page = $.mobile.pageContainer.pagecontainer("getActivePage"),
            height = parseInt(page.css("min-height"));

        if (open) {
            page.css("min-height",(height+65)+"px");
        } else {
            page.css("min-height",(height-65)+"px");
        }

        addnew.popup("reposition",{positionTo:"window"});
    });
}

function show_sites(showBack) {
    var page = $("<div data-role='page' id='site-control'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                "<a role='button' href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Manage Sites")+"</h3>" +
                "<button data-rel='popup' id='site-add' data-icon='plus' class='ui-btn-right'>"+_("Add")+"</button>" +
            "</div>" +
            "<div class='ui-content'>" +
            "</div>" +
            "<div data-role='popup' id='addsite' data-theme='b'>" +
                "<ul data-role='listview'>" +
                    "<li data-icon='false'><a href='#' id='site-add-scan'>"+_("Scan For Device")+"</a></li>" +
                    "<li data-icon='false'><a href='#' id='site-add-manual'>"+_("Manually Add Device")+"</a></li>" +
                "</ul>" +
            "</div>" +
        "</div>"),
        sites, total;

    page.find("#site-add").on("click",show_addsite);
    page.find("#site-add-scan").on("click",start_scan);
    page.find("#site-add-manual").on("click",function(){
        show_addnew(false,true);
    });

    page.one("pagehide",function(){
        page.remove();
    });

    storage.get(["sites","current_site"],function(data){
        if (data.sites === undefined || data.sites === null) {
            changePage("#start");
        } else {
            var list = "<div data-role='collapsible-set'>";

            sites = JSON.parse(data.sites);
            total = Object.keys(sites).length;

            if (!total || showBack === false || !(data.current_site in sites)) {
                page.one("pagebeforeshow",function(){
                    page.find(".ui-btn-left").hide();
                });
            }

            $.each(sites,function(a,b){
                var c = a.replace(/ /g,"_");
                list += "<fieldset "+((total === 1) ? "data-collapsed='false'" : "")+" id='site-"+c+"' data-role='collapsible'>";
                list += "<legend>"+a+"</legend>";
                list += "<a data-role='button' class='connectnow' data-site='"+a+"' href='#'>"+_("Connect Now")+"</a>";
                list += "<form data-site='"+c+"' novalidate>";
                list += "<label for='cnm-"+c+"'>"+_("Change Name")+"</label><input id='cnm-"+c+"' type='text' placeholder='"+a+"' />";
                list += "<label for='cip-"+c+"'>"+_("Change IP")+"</label><input id='cip-"+c+"' type='url' placeholder='"+b.os_ip+"' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' />";
                list += "<label for='cpw-"+c+"'>"+_("Change Password")+"</label><input id='cpw-"+c+"' type='password' />";
                list += "<input type='submit' value='"+_("Save Changes to")+" "+a+"' /></form>";
                list += "<a data-role='button' class='deletesite' data-site='"+a+"' href='#' data-theme='b'>"+_("Delete")+" "+a+"</a>";
                list += "</fieldset>";
            });

            list = $(list+"</div>");

            list.find(".connectnow").on("click",function(){
                update_site($(this).data("site"));
                return false;
            });

            list.find("form").on("submit",function(){
                change_site($(this).data("site"));
                return false;
            });

            list.find(".deletesite").on("click",function(){
                delete_site($(this).data("site"));
                return false;
            });

            page.find(".ui-content").html(list.enhanceWithin());
        }
    });

    page.appendTo("body");
}

function delete_site(site) {
    areYouSure(_("Are you sure you want to delete")+" '"+site+"'?","",function(){
        storage.get(["sites","current_site"],function(data){
            var sites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites);

            delete sites[site];
            storage.set({"sites":JSON.stringify(sites)},function(){
                update_site_list(Object.keys(sites),data.current_site);
                if ($.isEmptyObject(sites)) {
                    changePage("#start");
                    return false;
                }
                changePage("#site-control",{showLoadMsg: false});
                showerror(_("Site deleted successfully"));
                return false;
            });
        });
    });
}

// Modify site IP and/or password
function change_site(site) {
    storage.get(["sites","current_site"],function(data){
        var sites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites),
            ip = $("#cip-"+site).val(),
            pw = $("#cpw-"+site).val(),
            nm = $("#cnm-"+site).val(),
            rename;

        site = site.replace(/_/g," ");
        rename = (nm !== "" && nm !== site);

        if (ip !== "") {
            sites[site].os_ip = ip;
        }
        if (pw !== "") {
            sites[site].os_pw = pw;
        }
        if (rename) {
            sites[nm] = sites[site];
            delete sites[site];
            site = nm;
            storage.set({"current_site":site});
            update_site_list(Object.keys(sites),site);
        }

        storage.set({"sites":JSON.stringify(sites)});

        showerror(_("Site updated successfully"));

        if (site === data.current_site) {
            if (pw !== "") {
                curr_pw = pw;
            }
            if (ip !== "") {
                check_configured();
            }
        }

        if (rename) {
            changePage("#site-control");
        }
    });
}

// Update the panel list of sites
function update_site_list(names,current) {
    var list = "",
        select = $("#site-selector");

    $.each(names,function(a,b){
        list += "<option "+(b===current ? "selected ":"")+"value='"+b+"'>"+b+"</option>";
    });

    select.html(list);
    if (select.parent().parent().hasClass("ui-select")) {
        select.selectmenu("refresh");
    }
}

// Change the current site
function update_site(newsite) {
    storage.get("sites",function(data){
        var sites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites);
        if (newsite in sites) {
            storage.set({"current_site":newsite},check_configured);
        }
    });
}

// Automatic device detection functions
function checkAutoScan() {
    var finishCheck = function(){
        if (ip === undefined) {
            resetStartMenu();
            return;
        }

        var chk = parseIntArray(ip.split("."));

        // Check if the IP is on a private network, if not don't enable automatic scanning
        if (!(chk[0] === 10 || (chk[0] === 172 && chk[1] > 17 && chk[1] < 32) || (chk[0] === 192 && chk[1] === 168))) {
            resetStartMenu();
            return;
        }

        //Change main menu items to reflect ability to automatically scan
        var auto = $("#auto-scan"),
            next = auto.next();

        next.removeClass("ui-first-child").find("a.ui-btn").text(_("Manually Add Device"));
        auto.show();

        deviceip = ip;
    },
    ip;

    try {
        if (isChromeApp) {
            chrome.system.network.getNetworkInterfaces(function(data){
                var i;
                for (i in data) {
                    if (data.hasOwnProperty(i)) {
                        if (/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(data[i].address)) {
                            ip = data[i].address;
                        }
                    }
                }

                finishCheck();
            });
        } else {
            // Request the device's IP address
            networkinterface.getIPAddress(function(data){
                ip = data;
                finishCheck();
            });
        }
    } catch (err) {
        resetStartMenu();
        return;
    }
}

function resetStartMenu() {
    // Change main menu to reflect manual controller entry
    var auto = $("#auto-scan"),
        next = auto.next();

    deviceip = undefined;

    next.addClass("ui-first-child").find("a.ui-btn").text(_("Add Controller"));
    auto.hide();
}

function start_scan(port,type) {
    var ip = deviceip.split("."),
        scanprogress = 1,
        devicesfound = 0,
        newlist = "",
        suffix = "",
        oldips = [],
        i, url, notfound, found, baseip, check_scan_status, scanning, dtype;

    type = type || 0;

    storage.get("sites",function(data){
        var oldsites = (data.sites === undefined || data.sites === null) ? {} : JSON.parse(data.sites),
            i;

        for (i in oldsites) {
            if (oldsites.hasOwnProperty(i)) {
                oldips.push(oldsites[i].os_ip);
            }
        }
    });

    notfound = function(){
        scanprogress++;
    };

    found = function (reply) {
        scanprogress++;
        var ip = $.mobile.path.parseUrl(this.url).authority,
            fwv, tmp;

        if ($.inArray(ip,oldips) !== -1) {
            return;
        }

        if (this.dataType === "text") {
            tmp = reply.match(/var\s*ver=(\d+)/);
            if (!tmp) {
                return;
            }
            fwv = tmp[1];
        } else {
            fwv = reply.fwv;
        }

        devicesfound++;

        newlist += "<li><a class='ui-btn ui-btn-icon-right ui-icon-carat-r' href='#' data-ip='"+ip+"'>"+ip+"<p>"+_("Firmware")+": "+getOSVersion(fwv)+"</p></a></li>";
    };

    // Check if scanning is complete
    check_scan_status = function() {
        if (scanprogress === 245) {
            $.mobile.loading("hide");
            clearInterval(scanning);
            if (!devicesfound) {
                if (type === 0) {
                    start_scan(8080,1);
                } else if (type === 1) {
                    start_scan(80,2);
                } else if (type === 2) {
                    start_scan(8080,3);
                } else {
                    showerror(_("No new devices were detected on your network"));
                }
            } else {
                newlist = $(newlist);

                newlist.find("a").on("click",function(){
                    add_found($(this).data("ip"));
                    return false;
                });

                show_site_select(newlist);
            }
        }
    };

    ip.pop();
    baseip = ip.join(".");

    if (type === 1) {
        $.mobile.loading("show", {
                text: _("Scanning for OpenSprinkler Pi"),
                textVisible: true,
                theme: "b"
        });
    } else if (type === 2) {
        $.mobile.loading("show", {
                text: _("Scanning for OpenSprinkler (1.8.3)"),
                textVisible: true,
                theme: "b"
        });
    } else if (type === 3) {
        $.mobile.loading("show", {
                text: _("Scanning for OpenSprinkler Pi (1.8.3)"),
                textVisible: true,
                theme: "b"
        });
    } else {
        $.mobile.loading("show", {
                text: _("Scanning for OpenSprinkler"),
                textVisible: true,
                theme: "b"
        });
    }

    // Start scan
    for (i = 1; i<=244; i++) {
        ip = baseip+"."+i;
        if (type < 2) {
            suffix = "/jo";
            dtype = "json";
        } else {
            dtype = "text";
        }
        url = "http://"+ip+((port && port !== 80) ? ":"+port : "")+suffix;
        $.ajax({
            url: url,
            type: "GET",
            dataType: dtype,
            timeout: 3000,
            global: false,
            error: notfound,
            success: found
        });
    }
    scanning = setInterval(check_scan_status,200);
}

// Show popup for new device after populating device IP with selected result
function add_found(ip) {
    $("#site-select").one("popupafterclose", function(){
        show_addnew(ip);
    }).popup("close");
}

// Weather functions
function show_weather_settings() {
    var page = $("<div data-role='page' id='weather_settings'>" +
        "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
            "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
            "<h3>"+_("Weather Settings")+"</h3>" +
            "<a href='#' class='ui-btn-right wsubmit'>"+_("Submit")+"</a>" +
        "</div>" +
        "<div class='ui-content' role='main'>" +
            "<ul data-role='listview' data-inset='true'>" +
                "<li>" +
                    "<label for='weather_provider'>"+_("Weather Provider")+"</label>" +
                    "<select data-mini='true' id='weather_provider'>" +
                        "<option value='yahoo' "+(curr_wa.weather_provider === "yahoo" ? "selected" : "")+">"+_("Yahoo!")+"</option>" +
                        "<option value='wunderground' "+(curr_wa.weather_provider === "wunderground" ? "selected" : "")+">"+_("Wunderground")+"</option>" +
                    "</select>" +
                    "<label "+(curr_wa.weather_provider === "wunderground" ? "" : "style='display:none' ")+"for='wapikey'>"+_("Wunderground API Key")+"</label><input "+(curr_wa.weather_provider === "wunderground" ? "" : "style='display:none' ")+"data-mini='true' type='text' id='wapikey' value='"+curr_wa.wapikey+"' />" +
                "</li>" +
            "</ul>" +
            "<ul data-role='listview' data-inset='true'> " +
                "<li>" +
                    "<p class='rain-desc'>"+_("When automatic rain delay is enabled, the weather will be checked for rain every hour. If the weather reports any condition suggesting rain, a rain delay is automatically issued using the below set delay duration.")+"</p>" +
                        "<div class='ui-field-contain'>" +
                            "<label for='auto_delay'>"+_("Auto Rain Delay")+"</label>" +
                            "<input type='checkbox' data-on-text='On' data-off-text='Off' data-role='flipswitch' name='auto_delay' id='auto_delay' "+(curr_wa.auto_delay === "on" ? "checked" : "")+">" +
                        "</div>" +
                        "<div class='ui-field-contain duration-input'>" +
                            "<label for='delay_duration'>"+_("Delay Duration")+"</label>" +
                            "<button id='delay_duration' data-mini='true' value='"+(curr_wa.delay_duration*3600)+"'>"+dhms2str(sec2dhms(curr_wa.delay_duration*3600))+"</button>" +
                        "</div>" +
                "</li>" +
            "</ul>" +
            "<a class='wsubmit' href='#' data-role='button' data-theme='b' type='submit'>"+_("Submit")+"</a>" +
        "</div>" +
    "</div>");

    //Handle provider select change on weather settings
    page.find("#weather_provider").on("change",function(){
        var val = $(this).val();
        if (val === "wunderground") {
            page.find("#wapikey,label[for='wapikey']").show("fast");
            page.find("#wapikey").parent(".ui-input-text").css("border-style","solid");
        } else {
            page.find("#wapikey,label[for='wapikey']").hide("fast");
            page.find("#wapikey").parent(".ui-input-text").css("border-style","none");
        }
    });

    page.find(".wsubmit").on("click",function(){
        submit_weather_settings();
        return false;
    });

    page.find("#delay_duration").on("click",function(){
        var dur = $(this),
            name = page.find("label[for='"+dur.attr("id")+"']").text();

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
        },345600,2);
    });

    page.one({
        pagehide: function(){
            page.remove();
        },
        pagebeforeshow: function() {
            if (curr_wa.weather_provider !== "wunderground") {
                page.find("#wapikey").parent(".ui-input-text").css("border-style","none");
            }
        }
    });
    page.appendTo("body");
}

function submit_weather_settings() {
    var url = "/uwa?auto_delay="+($("#auto_delay").is(":checked") ? "on" : "off")+"&delay_duration="+parseInt($("#delay_duration").val()/3600)+"&weather_provider="+$("#weather_provider").val()+"&wapikey="+$("#wapikey").val();

    $.mobile.loading("show");

    send_to_os(url).then(
        function(){
            $.mobile.document.one("pageshow",function(){
                showerror(_("Weather settings have been saved"));
            });
            goBack();
            checkWeatherPlugin();
        },
        function(){
            showerror(_("Weather settings were not saved. Please try again."));
        }
    );
}

function convert_temp(temp,region) {
    if (region === "United States" || region === "Bermuda" || region === "Palau") {
        temp = temp+"&#176;F";
    } else {
        temp = parseInt(Math.round((temp-32)*(5/9)))+"&#176;C";
    }
    return temp;
}

function hide_weather() {
    $("#weather-list").animate({
        "margin-left": "-1000px"
    },1000,function(){
        $(this).hide();
    });
}

function update_weather() {
    storage.get(["provider","wapikey"],function(data){
        if (controller.settings.loc === "") {
            hide_weather();
            return;
        }

        showLoading("#weather");

        if (data.provider === "wunderground" && data.wapikey) {
            update_wunderground_weather(data.wapikey);
        } else {
            update_yahoo_weather();
        }
    });
}

function weather_update_failed(x,t,m) {
    if (m.url && (m.url.search("yahooapis.com") !== -1 || m.url.search("api.wunderground.com") !== -1)) {
        hide_weather();
        return;
    }
}

function update_yahoo_weather() {
    $.getJSON("https://query.yahooapis.com/v1/public/yql?q=select%20woeid%20from%20geo.placefinder%20where%20text=%22"+encodeURIComponent(controller.settings.loc)+"%22&format=json",function(woeid){
        if (woeid.query.results === null) {
            hide_weather();
            return;
        }

        var wid;

        if (typeof woeid.query.results.Result.woeid === "string") {
            wid = woeid.query.results.Result.woeid;
        } else {
            wid = woeid.query.results.Result[0].woeid;
        }

        $.getJSON("https://query.yahooapis.com/v1/public/yql?q=select%20item%2Ctitle%2Clocation%20from%20weather.forecast%20where%20woeid%3D%22"+wid+"%22&format=json",function(data){
            // Hide the weather if no data is returned
            if (data.query.results.channel.item.title === "City not found") {
                hide_weather();
                return;
            }
            var now = data.query.results.channel.item.condition,
                title = data.query.results.channel.title,
                loc = /Yahoo! Weather - (.*)/.exec(title),
                region = data.query.results.channel.location.country;

            $("#weather")
                .html("<div title='"+now.text+"' class='wicon cond"+now.code+"'></div><span>"+convert_temp(now.temp,region)+"</span><br><span class='location'>"+loc[1]+"</span>")
                .on("click",show_forecast);

            $("#weather-list").animate({
                "margin-left": "0"
            },1000).show();

            update_yahoo_forecast(data.query.results.channel.item.forecast,loc[1],region,now);

            $.mobile.document.trigger("weatherUpdateComplete");
        }).retry({times:retryCount, statusCodes: [0]}).fail(weather_update_failed);
    }).retry({times:retryCount, statusCodes: [0]}).fail(weather_update_failed);
}

function update_yahoo_forecast(data,loc,region,now) {
    var list = "<li data-role='list-divider' data-theme='a' class='center'>"+loc+"</li>",
        i;

    list += "<li data-icon='false' class='center'><div title='"+now.text+"' class='wicon cond"+now.code+"'></div><span data-translate='Now'>"+_("Now")+"</span><br><span>"+convert_temp(now.temp,region)+"</span></li>";

    for (i=0;i < data.length; i++) {
        list += "<li data-icon='false' class='center'><span>"+data[i].date+"</span><br><div title='"+data[i].text+"' class='wicon cond"+data[i].code+"'></div><span data-translate='"+data[i].day+"'>"+_(data[i].day)+"</span><br><span data-translate='Low'>"+_("Low")+"</span><span>: "+convert_temp(data[i].low,region)+"  </span><span data-translate='High'>"+_("High")+"</span><span>: "+convert_temp(data[i].high,region)+"</span></li>";
    }

    var forecast = $("#forecast_list");
    forecast.html(list).enhanceWithin();
    if (forecast.hasClass("ui-listview")) {
        forecast.listview("refresh");
    }
}

function update_wunderground_weather(wapikey) {
    $.getJSON("https://api.wunderground.com/api/"+wapikey+"/conditions/forecast/lang:EN/q/"+encodeURIComponent(controller.settings.loc)+".json", function(data) {
        var code, temp;

        if (data.current_observation.icon_url.indexOf("nt_") !== -1) {
            code = "nt_"+data.current_observation.icon;
        } else {
            code = data.current_observation.icon;
        }

        var ww_forecast = {
            "condition": {
                "text": data.current_observation.weather,
                "code": code,
                "temp_c": data.current_observation.temp_c,
                "temp_f": data.current_observation.temp_f,
                "date": data.current_observation.observation_time,
                "precip_today_in": data.current_observation.precip_today_in,
                "precip_today_metric": data.current_observation.precip_today_metric,
                "type": "wunderground"
            },
            "location": data.current_observation.display_location.full,
            "region": data.current_observation.display_location.country_iso3166,
            simpleforecast: {}
        };

        $.each(data.forecast.simpleforecast.forecastday,function(k,attr) {
             ww_forecast.simpleforecast[k] = attr;
        });

        if (ww_forecast.region === "US" || ww_forecast.region === "BM" || ww_forecast.region === "PW") {
            temp = Math.round(ww_forecast.condition.temp_f)+"&#176;F";
        } else {
            temp = ww_forecast.condition.temp_c+"&#176;C";
        }

        $("#weather")
            .html("<div title='"+ww_forecast.condition.text+"' class='wicon cond"+code+"'></div><span>"+temp+"</span><br><span class='location'>"+ww_forecast.location+"</span>")
            .on("click",show_forecast);

        $("#weather-list").animate({
            "margin-left": "0"
        },1000).show();

        update_wunderground_forecast(ww_forecast);

        $.mobile.document.trigger("weatherUpdateComplete");
    }).retry({times:retryCount, statusCodes: [0]}).fail(weather_update_failed);
}

function update_wunderground_forecast(data) {
    var temp, precip;

    if (data.region === "US" || data.region === "BM" || data.region === "PW") {
        temp = data.condition.temp_f+"&#176;F";
        precip = data.condition.precip_today_in+" in";
    } else {
        temp = data.condition.temp_c+"&#176;C";
        precip = data.condition.precip_today_metric+" mm";
    }

    var list = "<li data-role='list-divider' data-theme='a' class='center'>"+data.location+"</li>";
    list += "<li data-icon='false' class='center'><div title='"+data.condition.text+"' class='wicon cond"+data.condition.code+"'></div><span data-translate='Now'>"+_("Now")+"</span><br><span>"+temp+"</span><br><span data-translate='Precip'>"+_("Precip")+"</span><span>: "+precip+"</span></li>";
    $.each(data.simpleforecast, function(k,attr) {
        var precip;

        if (data.region === "US" || data.region === "BM" || data.region === "PW") {
            precip = attr.qpf_allday["in"];
            if (precip === null) {
                precip = 0;
            }
            list += "<li data-icon='false' class='center'><span>"+attr.date.monthname_short+" "+attr.date.day+"</span><br><div title='"+attr.conditions+"' class='wicon cond"+attr.icon+"'></div><span data-translate='"+attr.date.weekday_short+"'>"+_(attr.date.weekday_short)+"</span><br><span data-translate='Low'>"+_("Low")+"</span><span>: "+attr.low.fahrenheit+"&#176;F  </span><span data-translate='High'>"+_("High")+"</span><span>: "+attr.high.fahrenheit+"&#176;F</span><br><span data-translate='Precip'>"+_("Precip")+"</span><span>: "+precip+" in</span></li>";
        } else {
            precip = attr.qpf_allday.mm;
            if (precip === null) {
                precip = 0;
            }
            list += "<li data-icon='false' class='center'><span>"+attr.date.monthname_short+" "+attr.date.day+"</span><br><div title='"+attr.conditions+"' class='wicon cond"+attr.icon+"'></div><span data-translate='"+attr.date.weekday_short+"'>"+_(attr.date.weekday_short)+"</span><br><span data-translate='Low'>"+_("Low")+"</span><span>: "+attr.low.celsius+"&#176;C  </span><span data-translate='High'>"+_("High")+"</span><span>: "+attr.high.celsius+"&#176;C</span><br><span data-translate='Precip'>"+_("Precip")+"</span><span>: "+precip+" mm</span></li>";
        }
    });

    var forecast = $("#forecast_list");
    forecast.html(list).enhanceWithin();
    if (forecast.hasClass("ui-listview")) {
        forecast.listview("refresh");
    }
}

function show_forecast() {
    var page = $("#forecast");
    page.find("div[data-role='header'] > .ui-btn-right").on("click",function(){
        $.mobile.loading("show");
        $.mobile.document.one("weatherUpdateComplete",function(){
            $.mobile.loading("hide");
        });
        update_weather();
    });
    page.one("pagehide",function(){
        page.find("div[data-role='header'] > .ui-btn-right").off("click");
    });
    changePage("#forecast");
    return false;
}

function open_panel() {
    var panel = $("#sprinklers-settings");
    panel.panel("option","classes.modal","needsclick ui-panel-dismiss");
    panel.find("a[href='#site-control']").off("click").one("click",function(){
        changeFromPanel("site-control");
        return false;
    });
    panel.find("a[href='#about']").off("click").one("click",function(){
        changeFromPanel("about");
        return false;
    });
    panel.find(".export_config").off("click").on("click",function(){
        export_config();
        return false;
    });
    panel.find(".import_config").off("click").on("click",function(){
        import_config();
        return false;
    });
    panel.one("panelclose",function(){
        panel.find(".export_config,.import_config").off("click");
    });
    panel.panel("open");
}

// Bind settings page event listeners
function show_settings() {
    $.each(["en","mm"],function(a,id){
        var $id = $("#"+id);
        $id.prop("checked",controller.settings[id]);
        if ($id.hasClass("ui-flipswitch-input")) {
            $id.flipswitch("refresh");
        }
        $id.on("change",flipSwitched);
    });
    var settings = $("#settings");
    settings.find(".clear_logs > a").off("click").on("click",function(){
        areYouSure(_("Are you sure you want to clear all your log data?"), "", function() {
            var url = isOSPi() ? "/cl?pw=" : "/dl?pw=&day=all";
            $.mobile.loading("show");
            send_to_os(url).done(function(){
                $.mobile.loading("hide");
                showerror(_("Logs have been cleared"));
            });
        });
        return false;
    });
    settings.find(".reboot-os").off("click").on("click",function(){
        areYouSure(_("Are you sure you want to reboot OpenSprinkler?"), "", function() {
            $.mobile.loading("show");
            send_to_os("/cv?pw=&rbt=1").done(function(){
                $.mobile.loading("hide");
                showerror(_("OpenSprinkler is rebooting now"));
            });
        });
        return false;
    });
    settings.find(".clear-config").off("click").on("click",function(){
        areYouSure(_("Are you sure you want to delete all settings and return to the default settings?"), "", function() {
            storage.remove(["sites","current_site","lang","provider","wapikey","runonce"],function(){
                update_lang();
                changePage("#start");
            });
        });
        return false;
    });
    settings.find(".show-providers").off("click").on("click",function(){
        $("#providers").popup("destroy").remove();

        storage.get(["provider","wapikey"],function(data){
            data.provider = data.provider || "yahoo";

            var popup = $(
                "<div data-role='popup' id='providers' data-theme='a' data-overlay-theme='b'>"+
                    "<div class='ui-content'>"+
                        "<form>"+
                            "<label for='weather_provider'>"+_("Weather Provider")+
                                "<select data-mini='true' id='weather_provider'>"+
                                    "<option value='yahoo'>"+_("Yahoo!")+"</option>"+
                                    "<option "+((data.provider === "wunderground") ? "selected " : "")+"value='wunderground'>"+_("Wunderground")+"</option>"+
                                "</select>"+
                            "</label>"+
                            "<label for='wapikey'>"+_("Wunderground API Key")+"<input data-mini='true' type='text' id='wapikey' value='"+((data.wapikey) ? data.wapikey : "")+"' /></label>"+
                            "<input type='submit' value='"+_("Submit")+"' />"+
                        "</form>"+
                    "</div>"+
                "</div>"
            );

            if (data.provider === "yahoo") {
                popup.find("#wapikey").closest("label").hide();
            }

            popup.find("form").on("submit",function(e){
                e.preventDefault();

                var wapikey = $("#wapikey").val(),
                    provider = $("#weather_provider").val();

                if (provider === "wunderground" && wapikey === "") {
                    showerror(_("An API key must be provided for Weather Underground"));
                    return;
                }

                storage.set({
                    "wapikey": wapikey,
                    "provider": provider
                });

                update_weather();

                $("#providers").popup("close");

                return false;
            });

            //Handle provider select change on weather settings
            popup.on("change","#weather_provider",function(){
                var val = $(this).val();
                if (val === "wunderground") {
                    $("#wapikey").closest("label").show();
                } else {
                    $("#wapikey").closest("label").hide();
                }
                popup.popup("reposition",{
                    "positionTo": "window"
                });
            });

            popup.one("popupafterclose",function(){
                document.activeElement.blur();
                this.remove();
            }).popup().enhanceWithin().popup("open");
            return false;
        });
    });
    settings.find(".change_password > a").off("click").on("click",function(){
    // Device password management functions
        var popup = $("<div data-role='popup' id='changePassword' data-theme='a' data-overlay-theme='b'>"+
                    "<ul data-role='listview' data-inset='true'>" +
                        "<li data-role='list-divider'>"+_("Change Password")+"</li>" +
                        "<li>" +
                            "<form method='post' novalidate>" +
                                "<label for='npw'>"+_("New Password")+":</label>" +
                                "<input type='password' name='npw' id='npw' value='' />" +
                                "<label for='cpw'>"+_("Confirm New Password")+":</label>" +
                                "<input type='password' name='cpw' id='cpw' value='' />" +
                                "<input type='submit' value='"+_("Submit")+"' />" +
                            "</form>" +
                        "</li>" +
                    "</ul>" +
            "</div>");

        popup.find("form").on("submit",function(){
            var npw = popup.find("#npw").val(),
                cpw = popup.find("#cpw").val();

            if (npw !== cpw) {
                showerror(_("The passwords don't match. Please try again."));
                return false;
            }

            if (npw === "") {
                showerror(_("Password cannot be empty"));
                return false;
            }

            $.mobile.loading("show");
            send_to_os("/sp?pw=&npw="+encodeURIComponent(npw)+"&cpw="+encodeURIComponent(cpw),"json").done(function(info){
                var result = info.result;

                if (!result || result > 1) {
                    if (result === 2) {
                        showerror(_("Please check the current device password is correct then try again"));
                    } else {
                        showerror(_("Unable to change password. Please try again."));
                    }
                } else {
                    storage.get(["sites","current_site"],function(data){
                        var sites = JSON.parse(data.sites);

                        sites[data.current_site].os_pw = npw;
                        curr_pw = npw;
                        storage.set({"sites":JSON.stringify(sites)});
                    });
                    $.mobile.loading("hide");
                    popup.popup("close");
                    showerror(_("Password changed successfully"));
                }
            });

            return false;
        });

        popup.one("popupafterclose",function(){
            document.activeElement.blur();
            popup.remove();
        }).popup().enhanceWithin().popup("open");
    });
    settings.find("#downgradeui").off("click").on("click",function(){
        areYouSure(_("Are you sure you want to downgrade the UI?"), "", function(){
            var url = "http://rayshobby.net/scripts/java/svc"+getOSVersion();

            send_to_os("/cu?jsp="+encodeURIComponent(url)+"&pw=").done(function(){
                storage.remove(["sites","current_site","lang","provider","wapikey","runonce"]);
                location.reload();
            });
        });
        return false;
    });
    settings.find("#logout").off("click").on("click",function(){
        areYouSure(_("Are you sure you want to logout?"), "", function(){
            storage.remove(["sites","current_site","lang","provider","wapikey","runonce"],function(){
                location.reload();
            });
        });
        return false;
    });
    settings.find("#localization").find("a").off("click").on("click",function(){
        var link = $(this),
            lang = link.data("lang-code");

        update_lang(lang);
    });
    settings.one("pagehide",function(){
        $("#en,#mm").off("change");
        settings.find(".clear_logs > a,.reboot-os,.clear-config,.show-providers").off("click");
        $("#localization").find("a").off("click");
    });
}

// Device setting management functions
function show_options() {
    var list = "",
        page = $("<div data-role='page' id='os-options'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Change Options")+"</h3>" +
                "<button data-icon='check' class='ui-btn-right'>"+_("Submit")+"</button>" +
            "</div>" +
            "<div class='ui-content' role='main'>" +
            "</div>" +
        "</div>"),
        fixContain = function() {
            var width = $(window).width(),
                ele = page.find(".contain-field");

            if (width > 1100) {
                ele.addClass("ui-field-contain");
            } else {
                ele.removeClass("ui-field-contain");
            }
        },
        timezones, tz, i;

    page.find("div[data-role='header'] > .ui-btn-right").on("click",submit_options);

    list = "<li><fieldset>";

    if (typeof controller.options.ntp !== "undefined") {
        list += "<div class='contain-field datetime-input'><label for='datetime'>"+_("Device Time")+"</label><button "+(controller.options.ntp ? "disabled " : "")+"data-mini='true' id='datetime' value='"+(controller.settings.devt + (new Date().getTimezoneOffset()*60))+"'>"+dateToString(new Date(controller.settings.devt*1000)).slice(0,-3)+"</button></div>";
    }

    if (!isOSPi() && typeof controller.options.tz !== "undefined") {
        timezones = ["-12:00","-11:30","-11:00","-10:00","-09:30","-09:00","-08:30","-08:00","-07:00","-06:00","-05:00","-04:30","-04:00","-03:30","-03:00","-02:30","-02:00","+00:00","+01:00","+02:00","+03:00","+03:30","+04:00","+04:30","+05:00","+05:30","+05:45","+06:00","+06:30","+07:00","+08:00","+08:45","+09:00","+09:30","+10:00","+10:30","+11:00","+11:30","+12:00","+12:45","+13:00","+13:45","+14:00"];
        tz = controller.options.tz-48;
        tz = ((tz>=0)?"+":"-")+pad((Math.abs(tz)/4>>0))+":"+((Math.abs(tz)%4)*15/10>>0)+((Math.abs(tz)%4)*15%10);
        list += "<div class='contain-field'><label for='o1' class='select'>"+_("Timezone")+"</label><select data-mini='true' id='o1'>";
        for (i=0; i<timezones.length; i++) {
            list += "<option "+((timezones[i] === tz) ? "selected" : "")+" value='"+timezones[i]+"'>"+timezones[i]+"</option>";
        }
        list += "</select></div>";
    }

    list += "<div class='contain-field'><label for='loc'>"+_("Location")+"<button data-helptext='"+_("Location can be a zip code, city/state or a weatherunderground personal weather station using the format: pws:ID")+"' class='needsclick help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button></label><input data-mini='true' type='text' id='loc' value='"+controller.settings.loc+"' /></div>";

    if (typeof controller.options.mas !== "undefined") {
        list += "<div class='contain-field'><label for='o18' class='select'>"+_("Master Station")+"</label><select data-native-menu='false' data-mini='true' id='o18'><option value='0'>"+_("None")+"</option>";
        for (i=0; i<controller.stations.snames.length; i++) {
            list += "<option "+(((i+1) === controller.options.mas) ? "selected" : "")+" value='"+(i+1)+"'>"+controller.stations.snames[i]+"</option>";
            if (i === 7) {
                break;
            }
        }
        list += "</select></div>";
    }

    if (typeof controller.options.mton !== "undefined") {
        list += "<div class='contain-field duration-field'><label for='o19'>"+_("Master On Delay")+"</label><button data-mini='true' id='o19' value='"+controller.options.mton+"'>"+dhms2str(sec2dhms(controller.options.mton))+"</button></div>";
    }

    if (typeof controller.options.mtof !== "undefined") {
        list += "<div class='contain-field'><label for='o20'>"+_("Master Off Delay")+"</label><input data-highlight='true' type='number' pattern='[0-9]*' data-type='range' min='-60' max='60' id='o20' value='"+controller.options.mtof+"' /></div>";
    }

    if (typeof controller.options.ext !== "undefined") {
        list += "<div class='contain-field'><label for='o15'>"+_("Extension Boards")+(controller.options.dexp && controller.options.dexp < 255 ? " ("+controller.options.dexp+" "+_("detected")+")" : "")+"</label><input data-highlight='true' type='number' pattern='[0-9]*' data-type='range' min='0' max='"+(controller.options.mexp ? controller.options.mexp : "5")+"' id='o15' value='"+controller.options.ext+"' /></div>";
    }

    if (typeof controller.options.sdt !== "undefined") {
        list += "<div class='contain-field duration-field'><label for='o17'>"+_("Station Delay")+"</label><button data-mini='true' id='o17' value='"+controller.options.sdt+"'>"+dhms2str(sec2dhms(controller.options.sdt))+"</button></div>";
    }

    if (typeof controller.options.wl !== "undefined") {
        list += "<div class='contain-field'><label for='o23'>"+_("% Watering")+"<button data-helptext='"+_("The watering level modifies station run times by the set percentage")+"' class='needsclick help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button></label><input data-highlight='true' type='number' pattern='[0-9]*' data-type='range' min='0' max='250' id='o23' value='"+controller.options.wl+"' /></div>";
    }

    if (typeof controller.options.hp0 !== "undefined") {
        list += "<div class='contain-field'><label for='o12'>"+_("HTTP Port (restart required)")+"</label><input data-mini='true' type='number' pattern='[0-9]*' id='o12' value='"+(controller.options.hp1*256+controller.options.hp0)+"' /></div>";
    }

    if (typeof controller.options.devid !== "undefined") {
        list += "<div class='contain-field'><label for='o26'>"+_("Device ID (restart required)")+"<button data-helptext='"+_("Device ID modifies the last byte of the MAC address")+"' class='needsclick help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button></label><input data-mini='true' type='number' pattern='[0-9]*' max='255' id='o26' value='"+controller.options.devid+"' /></div>";
    }

    if (typeof controller.options.rlp !== "undefined") {
        list += "<div class='contain-field duration-field'><label for='o30'>"+_("Relay Pulse")+"<button data-helptext='"+_("Relay pulsing is used for special situations where rapid pulsing is needed in the output with a range from 1 to 2000 milliseconds. A zero value disables the pulsing option.")+"' class='needsclick help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button></label><button data-mini='true' id='o30' value='"+controller.options.rlp+"'>"+controller.options.rlp+"ms</button></div>";
    }

    if (typeof controller.options.seq !== "undefined") {
        list += "<label for='o16'><input data-mini='true' id='o16' type='checkbox' "+((controller.options.seq === 1) ? "checked='checked'" : "")+" />"+_("Sequential")+"</label>";
    }

    if (typeof controller.options.urs !== "undefined") {
        list += "<label for='o21'><input data-mini='true' id='o21' type='checkbox' "+((controller.options.urs === 1) ? "checked='checked'" : "")+" />"+_("Use Rain Sensor")+"</label>";
    }

    if (typeof controller.options.rso !== "undefined") {
        list += "<label for='o22'><input data-mini='true' id='o22' type='checkbox' "+((controller.options.rso === 1) ? "checked='checked'" : "")+" />"+_("Normally Open (Rain Sensor)")+"</label>";
    }

    if (typeof controller.options.ntp !== "undefined") {
        list += "<label for='o2'><input data-mini='true' id='o2' type='checkbox' "+((controller.options.ntp === 1) ? "checked='checked'" : "")+" />"+_("NTP Sync")+"</label>";
    }

    if (typeof controller.options.ar !== "undefined") {
        //"<button data-helptext='"+_("Auto reconnect attempts to re-establish a network connection after an outage")+"' class='needsclick help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>"
        list += "<label for='o14'><input data-mini='true' id='o14' type='checkbox' "+((controller.options.ar === 1) ? "checked='checked'" : "")+" />"+_("Auto Reconnect")+"</label>";
    }

    if (typeof controller.options.ipas !== "undefined") {
        list += "<label for='o25'><input data-mini='true' id='o25' type='checkbox' "+((controller.options.ipas === 1) ? "checked='checked'" : "")+" />"+_("Ignore Password")+"</label>";
    }

    list += "</fieldset></li>";

    page.find(".ui-content").html("<ul data-role='listview' data-inset='true' id='os-options-list'>"+list+"</ul>");

    page.find(".help-icon").on("click",function(e){
        e.stopImmediatePropagation();

        var button = $(this),
            text = button.data("helptext"),
            popup = $("<div data-role='popup'>" +
                    "<p>"+text+"</p>" +
                "</div>");

        popup.one("popupafterclose", function(){
            popup.popup("destroy").remove();
        }).enhanceWithin();

        $(".ui-page-active").append(popup);

        popup.popup({history: false, positionTo: button}).popup("open");

        return false;
    });

    fixContain();

    $.mobile.window.on("resize",fixContain);

    page.find(".duration-field button").on("click",function(){
        var dur = $(this),
            id = dur.attr("id"),
            name = page.find("label[for='"+id+"']").text(),
            max = 240;

        if (id === "o19") {
            max = 60;
        } else if (id === "o30") {
            showMillisecondRequest(dur.val(),name,function(result){
                dur.val(result).text(result+"ms");
            },2000);
            return;
        }

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
        },max);

        return false;
    });

    page.find("#o2").on("change",function(){
        // Switch state of device time input based on NTP status
        page.find(".datetime-input button").prop("disabled",$(this).is(":checked"));
    });

    page.find(".datetime-input").on("click",function(){
        var input = $(this).find("button");

        if (input.prop("disabled")) {
            return;
        }

        // Show date time input popup
        showDateTimeInput(input.val(),function(data){
            input.text(dateToString(data).slice(0,-3)).val(Math.round(data.getTime()/1000));
        });
        return false;
    });

    page.one("pagehide",function(){
        page.remove();
        $.mobile.window.off("resize");
    });

    page.appendTo("body");
}

function submit_options() {
    var opt = {},
        invalid = false,
        isPi = isOSPi(),
        keyNames = {1:"tz",2:"ntp",12:"htp",13:"htp2",14:"ar",15:"nbrd",16:"seq",17:"sdt",18:"mas",19:"mton",20:"mtoff",21:"urs",22:"rst",23:"wl",25:"ipas",30:"rlp"},
        key;

    $("#os-options-list").find(":input,button").each(function(a,b){
        var $item = $(b),
            id = $item.attr("id"),
            data = $item.val();

        if (!id || !data) {
            return true;
        }

        switch (id) {
            case "o1":
                var tz = data.split(":");
                tz[0] = parseInt(tz[0],10);
                tz[1] = parseInt(tz[1],10);
                tz[1]=(tz[1]/15>>0)/4.0;tz[0]=tz[0]+(tz[0]>=0?tz[1]:-tz[1]);
                data = ((tz[0]+12)*4)>>0;
                break;
            case "datetime":
                var dt = new Date(data*1000);
                dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset());

                opt.tyy = dt.getFullYear();
                opt.tmm = dt.getMonth();
                opt.tdd = dt.getDate();
                opt.thh = dt.getHours();
                opt.tmi = dt.getMinutes();
                opt.ttt = Math.round(dt.getTime()/1000);

                return true;
            case "o12":
                if (!isPi) {
                    opt.o12 = data&0xff;
                    opt.o13 = (data>>8)&0xff;
                }
                return true;
            case "o2":
            case "o14":
            case "o16":
            case "o21":
            case "o22":
            case "o25":
                data = $item.is(":checked") ? 1 : 0;
                if (!data) {
                    return true;
                }
                break;
        }
        if (isPi) {
            if (id === "loc") {
                id = "oloc";
            } else {
                key = /\d+/.exec(id);
                id = "o"+keyNames[key];
            }
        }
        opt[id] = data;
    });
    if (invalid) {
        return;
    }
    $.mobile.loading("show");
    send_to_os("/co?pw=&"+$.param(opt)).done(function(){
        $.mobile.document.one("pageshow",function(){
            showerror(_("Settings have been saved"));
        });
        goBack();
        update_controller(update_weather);
    });
}

// Station managament function
function show_stations() {
    var list = "<li class='wrap'>",
        page = $("<div data-role='page' id='os-stations'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Edit Stations")+"</h3>" +
                "<button data-icon='check' class='submit ui-btn-right'>"+_("Submit")+"</button>" +
            "</div>" +
            "<div class='ui-content' role='main'>" +
            "</div>" +
        "</div>"),
        isMaster = controller.options.mas ? true : false,
        hasIR = (typeof controller.stations.ignore_rain === "object") ? true : false,
        hasAR = (typeof controller.stations.act_relay === "object") ? true : false,
        useTableView = (hasIR || isMaster || hasAR);

    if (useTableView) {
        list += "<table><tr><th class='center'>"+_("Station Name")+"</th>";
        if (isMaster) {
            list += "<th class='center'>"+_("Activate Master?")+"</th>";
        }
        if (hasIR) {
            list += "<th class='center'>"+_("Ignore Rain?")+"</th>";
        }
        if (hasAR) {
            list += "<th class='center'>"+_("Activate Relay?")+"</th>";
        }
        list += "</tr>";
    }

    $.each(controller.stations.snames,function(i, station) {
        if (useTableView) {
            list += "<tr><td>";
        }
        list += "<input data-mini='true' id='edit_station_"+i+"' type='text' value='"+station+"' />";
        if (useTableView) {
            list += "</td>";
            if (isMaster) {
                if (controller.options.mas === i+1) {
                    list += "<td class='use_master'><p id='um_"+i+"' class='center'>("+_("Master")+")</p></td>";
                } else {
                    list += "<td data-role='controlgroup' data-type='horizontal' class='use_master'><label for='um_"+i+"'><input id='um_"+i+"' type='checkbox' "+((controller.stations.masop[parseInt(i/8)]&(1<<(i%8))) ? "checked='checked'" : "")+" /></label></td>";
                }
            }
            if (hasIR) {
                list += "<td data-role='controlgroup' data-type='horizontal' class='use_master'><label for='ir_"+i+"'><input id='ir_"+i+"' type='checkbox' "+((controller.stations.ignore_rain[parseInt(i/8)]&(1<<(i%8))) ? "checked='checked'" : "")+" /></label></td>";
            }
            if (hasAR) {
                list += "<td data-role='controlgroup' data-type='horizontal' class='use_master'><label for='ar_"+i+"'><input id='ar_"+i+"' type='checkbox' "+((controller.stations.act_relay[parseInt(i/8)]&(1<<(i%8))) ? "checked='checked'" : "")+" /></label></td>";
            }
            list += "</tr>";
        }
        i++;
    });

    if (useTableView) {
        list += "</table>";
    }
    list = $("<ul data-role='listview' data-inset='true' id='os-stations-list'>"+list+"</li></ul><button class='submit'>"+_("Submit")+"</button><button data-theme='b' class='reset'>"+_("Reset")+"</button>");

    page.find(".ui-content").html(list);

    page.find(".submit").on("click",submit_stations);

    page.find(".reset").on("click",function(){
        page.find("[id^='edit_station_']").each(function(a,b){
            $(b).val("S"+pad(a+1));
        });
        page.find("input[type='checkbox']").each(function(a,b){
            $(b).prop("checked",false).checkboxradio("refresh");
        });
    });

    page.one("pagehide",function(){
        page.remove();
    });

    page.appendTo("body");
}

function submit_stations() {
    var names = {},
        invalid = false,
        master = {
            boardStatus: "",
            boardIndex: 0,
            currentIndex: 0,
            fullStatus: {},
            param: ""
        },
        rain = $.extend(true, {},master),
        relay = $.extend(true, {},master);

    $("#os-stations-list").find(":input,p[id^='um_']").each(function(a,b){
        var $item = $(b), id = $item.attr("id"), data = $item.val();
        switch (id) {
            case "edit_station_" + id.slice("edit_station_".length):
                id = "s" + id.split("_")[2];
                if (data.length > 32) {
                    invalid = true;
                    $item.focus();
                    showerror(_("Station name must be 32 characters or less"));
                    return false;
                }
                names[id] = data;
                return true;
            case "um_" + id.slice("um_".length):
                master.boardStatus = ($item.is(":checked") || $item.prop("tagName") === "P") ? "1".concat(master.boardStatus) : "0".concat(master.boardStatus);
                master.currentIndex++;
                if (parseInt(master.currentIndex/8) > master.boardIndex) {
                    master.fullStatus["m"+master.boardIndex]=parseInt(master.boardStatus,2); master.boardIndex++; master.currentIndex=0; master.boardStatus="";
                }
                return true;
            case "ir_" + id.slice("ir_".length):
                rain.boardStatus = ($item.is(":checked")) ? "1".concat(rain.boardStatus) : "0".concat(rain.boardStatus);
                rain.currentIndex++;
                if (parseInt(rain.currentIndex/8) > rain.boardIndex) {
                    rain.fullStatus["i"+rain.boardIndex]=parseInt(rain.boardStatus,2); rain.boardIndex++; rain.currentIndex=0; rain.boardStatus="";
                }
                return true;
            case "ar_" + id.slice("ar_".length):
                relay.boardStatus = ($item.is(":checked")) ? "1".concat(relay.boardStatus) : "0".concat(relay.boardStatus);
                relay.currentIndex++;
                if (parseInt(relay.currentIndex/8) > relay.boardIndex) {
                    relay.fullStatus["a"+relay.boardIndex]=parseInt(relay.boardStatus,2); relay.boardIndex++; relay.currentIndex=0; relay.boardStatus="";
                }
                return true;
        }
    });
    master.fullStatus["m"+master.boardIndex]=parseInt(master.boardStatus,2);
    rain.fullStatus["i"+rain.boardIndex]=parseInt(rain.boardStatus,2);
    relay.fullStatus["a"+relay.boardIndex]=parseInt(relay.boardStatus,2);

    if ($("[id^='um_']").length) {
        master.param = "&"+$.param(master.fullStatus);
    }
    if ($("[id^='ir_']").length) {
        rain.param = "&"+$.param(rain.fullStatus);
    }
    if ($("[id^='ar_']").length) {
        relay.param = "&"+$.param(relay.fullStatus);
    }
    if (invalid) {
        return;
    }
    $.mobile.loading("show");
    send_to_os("/cs?pw=&"+$.param(names)+master.param+rain.param+relay.param).done(function(){
        $.mobile.document.one("pageshow",function(){
            showerror(_("Stations have been updated"));
        });
        goBack();
        update_controller();
    });
}

// Current status related functions
function get_status() {
    var page = $("#status"),
        runningTotal = {},
        allPnames = [],
        color = "",
        list = "",
        tz = controller.options.tz-48,
        lastCheck;

    if ($.mobile.pageContainer.pagecontainer("getActivePage").attr("id") === "status") {
        page.find(".ui-content").empty();
    }

    page.find("div[data-role='header'] > .ui-btn-right").on("click",refresh_status);

    tz = ((tz>=0)?"+":"-")+pad((Math.abs(tz)/4>>0))+":"+((Math.abs(tz)%4)*15/10>>0)+((Math.abs(tz)%4)*15%10);

    var header = "<span id='clock-s' class='nobr'>"+dateToString(new Date(controller.settings.devt*1000))+"</span>"+tzToString(" ","GMT",tz);

    if (typeof controller.settings.ct === "string" && controller.settings.ct !== "0" && typeof controller.settings.tu === "string") {
        header += " <span>"+controller.settings.ct+"&deg;"+controller.settings.tu+"</span>";
    }

    runningTotal.c = controller.settings.devt;

    var master = controller.options.mas,
        ptotal = 0;

    var open = {};
    $.each(controller.status, function (i, stn) {
        if (stn) {
            open[i] = stn;
        }
    });
    open = Object.keys(open).length;

    if (master && controller.status[master-1]) {
        open--;
    }

    $.each(controller.stations.snames,function(i, station) {
        var info = "";

        if (master === i+1) {
            station += " ("+_("Master")+")";
        } else if (controller.settings.ps[i][0]) {
            var rem=controller.settings.ps[i][1];
            if (open > 1) {
                if (rem > ptotal) {
                    ptotal = rem;
                }
            } else {
                if (controller.settings.ps[i][0] !== 99 && rem !== 1) {
                    ptotal+=rem;
                }
            }
            var pid = controller.settings.ps[i][0],
                pname = pidname(pid);
            if (controller.status[i] && (pid!==255&&pid!==99)) {
                runningTotal[i] = rem;
            }
            allPnames[i] = pname;
            info = "<p class='rem'>"+((controller.status[i]) ? _("Running") : _("Scheduled"))+" "+pname;
            if (pid!==255&&pid!==99) {
                info += " <span id='countdown-"+i+"' class='nobr'>(" + sec2hms(rem) + " "+_("remaining")+")</span>";
            }
            info += "</p>";
         }
        if (controller.status[i]) {
            color = "green";
        } else {
            color = "red";
        }
        list += "<li class='"+color+"'><p class='sname'>"+station+"</p>"+info+"</li>";
    });

    var footer = "";
    var lrdur = controller.settings.lrun[2];

    if (lrdur !== 0) {
        var lrpid = controller.settings.lrun[1];
        var pname= pidname(lrpid);

        footer = "<p>"+pname+" "+_("last ran station")+" "+controller.stations.snames[controller.settings.lrun[0]]+" "+_("for")+" "+(lrdur/60>>0)+"m "+(lrdur%60)+"s "+_("on")+" "+dateToString(new Date(controller.settings.lrun[3]*1000))+"</p>";
    }

    if (ptotal > 1) {
        var scheduled = allPnames.length;
        if (!open && scheduled) {
            runningTotal.d = controller.options.sdt;
        }
        if (open === 1) {
            ptotal += (scheduled-1)*controller.options.sdt;
        }
        allPnames = getUnique($.grep(allPnames,function(n){return(n);}));
        var numProg = allPnames.length;
        allPnames = allPnames.join(" "+_("and")+" ");
        var pinfo = allPnames+" "+((numProg > 1) ? _("are") : _("is"))+" "+_("running")+" ";
        pinfo += "<br><span id='countdown-p' class='nobr'>("+sec2hms(ptotal)+" "+_("remaining")+")</span>";
        runningTotal.p = ptotal;
        header += "<br>"+pinfo;
    } else if (controller.settings.rd) {
        header +="<br>"+_("Rain delay until")+" "+dateToString(new Date(controller.settings.rdst*1000));
    } else if (controller.options.urs === 1 && controller.settings.rs === 1) {
        header +="<br>"+_("Rain detected");
    }

    page.find(".ui-content").append(
        $("<p class='smaller center'></p>").html(header),
        $("<ul data-role='listview' data-inset='true' id='status_list'></ul>").html(list).listview(),
        $("<p class='smaller center'></p>").html(footer)
    );

    removeTimers();

    page.one("pagehide",function(){
        removeTimers();
        page.find(".ui-header > .ui-btn-right").off("click");
        page.find(".ui-content").empty();
    });

    if (runningTotal.d !== undefined) {
        delete runningTotal.p;
        setTimeout(refresh_status,runningTotal.d*1000);
    }

    lastCheck = new Date().getTime();
    interval_id = setInterval(function(){
        var now = new Date().getTime(),
            currPage = $(".ui-page-active").attr("id"),
            diff = now - lastCheck;

        if (diff > 3000) {
            clearInterval(interval_id);
            if (currPage === "status") {
                refresh_status();
            }
        }
        lastCheck = now;
        $.each(runningTotal,function(a,b){
            if (b <= 0) {
                delete runningTotal[a];
                if (a === "p") {
                    if (currPage === "status") {
                        refresh_status();
                    } else {
                        clearInterval(interval_id);
                        return;
                    }
                } else {
                    $("#countdown-"+a).parent("p").text(_("Station delay")).parent("li").removeClass("green").addClass("red");
                    timeout_id = setTimeout(refresh_status,controller.options.sdt*1000);
                }
            } else {
                if (a === "c") {
                    ++runningTotal[a];
                    $("#clock-s").text(dateToString(new Date(runningTotal[a]*1000)));
                } else {
                    --runningTotal[a];
                    $("#countdown-"+a).text("(" + sec2hms(runningTotal[a]) + " "+_("remaining")+")");
                }
            }
        });
    },1000);
}

function refresh_status() {
    var page = $(".ui-page-active").attr("id");

    if (page === "status") {
        $.mobile.loading("show");
    }

    $.when(
        update_controller_status(),
        update_controller_settings()
    ).then(function(){
        if (page === "status") {
            get_status();
            $.mobile.loading("hide");
        } else if (page === "sprinklers") {
            removeTimers();
            check_status();
        }

        return;
    },network_fail);
}

function removeTimers() {
    //Remove any status timers that may be running
    if (interval_id !== undefined) {
        clearInterval(interval_id);
    }
    if (timeout_id !== undefined) {
        clearTimeout(timeout_id);
    }
}

// Actually change the status bar
function change_status(seconds,sdelay,color,line,onclick) {
    var footer = $("#footer-running");

    onclick = onclick || function(){};

    removeTimers();

    if (seconds > 1) {
        update_timer(seconds,sdelay);
    }

    footer.removeClass().addClass(color).html(line).off("click").on("click",onclick).slideDown();
}

// Update status bar based on device status
function check_status() {
    var open, ptotal, sample, pid, pname, line, match, tmp, i;

    // Handle operation disabled
    if (!controller.settings.en) {
        change_status(0,controller.options.sdt,"red","<p id='running-text' class='center'>"+_("System Disabled")+"</p>",function(){
            areYouSure(_("Do you want to re-enable system operation?"),"",function(){
                showLoading("#footer-running");
                send_to_os("/cv?pw=&en=1").done(function(){
                    update_controller(check_status);
                });
            });
        });
        return;
    }

    // Handle open stations
    open = {};
    for (i=0; i<controller.status.length; i++) {
        if (controller.status[i]) {
            open[i] = controller.status[i];
        }
    }

    if (controller.options.mas) {
        delete open[controller.options.mas-1];
    }

    // Handle more than 1 open station
    if (Object.keys(open).length >= 2) {
        ptotal = 0;

        for (i in open) {
            if (open.hasOwnProperty(i)) {
                tmp = controller.settings.ps[i][1];
                if (tmp > ptotal) {
                    ptotal = tmp;
                }
            }
        }

        sample = Object.keys(open)[0];
        pid    = controller.settings.ps[sample][0];
        pname  = pidname(pid);
        line   = "<div id='running-icon'></div><p id='running-text'>";

        line += pname+" "+_("is running on")+" "+Object.keys(open).length+" "+_("stations")+" ";
        if (pid!==255&&pid!==99) {
            line += "<span id='countdown' class='nobr'>("+sec2hms(ptotal)+" "+_("remaining")+")</span>";
        }
        line += "</p>";
        change_status(ptotal,controller.options.sdt,"green",line,function(){
            changePage("#status");
        });
        return;
    }

    // Handle a single station open
    match = false;
    for (i=0; i<controller.stations.snames.length; i++) {
        if (controller.settings.ps[i][0] && controller.status[i] && controller.options.mas !== i+1) {
            match = true;
            pid = controller.settings.ps[i][0];
            pname = pidname(pid);
            line = "<div id='running-icon'></div><p id='running-text'>";
            line += pname+" "+_("is running on station")+" <span class='nobr'>"+controller.stations.snames[i]+"</span> ";
            if (pid!==255&&pid!==99) {
                line += "<span id='countdown' class='nobr'>("+sec2hms(controller.settings.ps[i][1])+" "+_("remaining")+")</span>";
            }
            line += "</p>";
            break;
        }
    }

    if (match) {
        change_status(controller.settings.ps[i][1],controller.options.sdt,"green",line,function(){
            changePage("#status");
        });
        return;
    }

    // Handle rain delay enabled
    if (controller.settings.rd) {
        change_status(0,controller.options.sdt,"red","<p id='running-text' class='center'>"+_("Rain delay until")+" "+dateToString(new Date(controller.settings.rdst*1000))+"</p>",function(){
            areYouSure(_("Do you want to turn off rain delay?"),"",function(){
                showLoading("#footer-running");
                send_to_os("/cv?pw=&rd=0").done(function(){
                    update_controller(check_status);
                });
            });
        });
        return;
    }

    // Handle rain sensor triggered
    if (controller.options.urs === 1 && controller.settings.rs === 1) {
        change_status(0,controller.options.sdt,"red","<p id='running-text' class='center'>"+_("Rain detected")+"</p>");
        return;
    }

    // Handle manual mode enabled
    if (controller.settings.mm === 1) {
        change_status(0,controller.options.sdt,"red","<p id='running-text' class='center'>"+_("Manual mode enabled")+"</p>",function(){
            areYouSure(_("Do you want to turn off manual mode?"),"",function(){
                showLoading("#footer-running");
                send_to_os("/cv?pw=&mm=0").done(function(){
                    update_controller(check_status);
                });
            });
        });
        return;
    }

    $("#footer-running").slideUp();
}

// Handle timer update on the home page for the status bar
function update_timer(total,sdelay) {
    var lastCheck = new Date().getTime();
    interval_id = setInterval(function(){
        var now = new Date().getTime();
        var diff = now - lastCheck;
        if (diff > 3000) {
            clearInterval(interval_id);
            showLoading("#footer-running");
            update_controller(check_status);
        }
        lastCheck = now;

        if (total <= 0) {
            clearInterval(interval_id);
            showLoading("#footer-running");
            if (timeout_id !== undefined) {
                clearTimeout(timeout_id);
            }
            timeout_id = setTimeout(function(){
                update_controller(check_status);
            },(sdelay*1000));
        } else {
            --total;
        }
        $("#countdown").text("(" + sec2hms(total) + " "+_("remaining")+")");
    },1000);
}

// Manual control functions
function get_manual() {
    var list = "<li data-role='list-divider' data-theme='a'>"+_("Sprinkler Stations")+"</li>",
        page = $("<div data-role='page' id='manual'>" +
                "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false'>" +
                    "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                    "<h3>"+_("Manual Control")+"</h3>" +
                "</div>" +
                "<div class='ui-content' role='main'>" +
                    "<p class='center'>"+_("With manual mode turned on, tap a station to toggle it.")+"</p>" +
                    "<fieldset data-role='collapsible' data-collapsed='false' data-mini='true'>" +
                        "<legend>"+_("Options")+"</legend>" +
                        "<div class='ui-field-contain'>" +
                            "<label for='mmm'><b>"+_("Manual Mode")+"</b></label>" +
                            "<input type='checkbox' data-on-text='On' data-off-text='Off' data-role='flipswitch' name='mmm' id='mmm'"+(controller.settings.mm ? " checked" : "")+">" +
                        "</div>" +
                        "<p class='rain-desc smaller center' style='padding-top:5px'>"+_("Station timer prevents a station from running indefinitely and will automatically turn it off after the set duration (or when toggled off)")+"</p>" +
                        "<div class='ui-field-contain duration-input'>" +
                            "<label for='auto-off'><b>"+_("Station Timer")+"</b></label><button data-mini='true' name='auto-off' id='auto-off' value='3600'>1h</button>" +
                        "</div>" +
                    "</fieldset>" +
                "</div>" +
            "</div>"),
        check_toggle = function(currPos){
            update_controller_status().done(function(){
                var item = listitems.eq(currPos).find("a");

                if (controller.options.mas) {
                    if (controller.status[controller.options.mas-1]) {
                        listitems.eq(controller.options.mas-1).addClass("green");
                    } else {
                        listitems.eq(controller.options.mas-1).removeClass("green");
                    }
                }

                item.text(controller.stations.snames[currPos]);

                if (controller.status[currPos]) {
                    item.removeClass("yellow").addClass("green");
                } else {
                    item.removeClass("green yellow");
                }
            });
        },
        toggle = function(){
            if (!controller.settings.mm) {
                showerror(_("Manual mode is not enabled. Please enable manual mode then try again."));
                return false;
            }

            var anchor = $(this),
                item = anchor.closest("li"),
                currPos = listitems.index(item);

            if (anchor.hasClass("yellow")) {
                return false;
            }

            if (controller.status[currPos]) {
                dest = "/sn"+(currPos+1)+"=0";
            } else {
                dest = "/sn"+(currPos+1)+"=1&t="+autoOff.val();
            }

            anchor.removeClass("green").addClass("yellow");
            anchor.html("<p class='ui-icon ui-icon-loading mini-load'></p>");

            send_to_os(dest).always(
                function(){
                    // The device usually replies before the station has actually toggled. Delay in order to wait for the station's to toggle.
                    setTimeout(check_toggle,1000,currPos);
                }
            );

            return false;
        },
        autoOff = page.find("#auto-off"),
        dest, mmlist, listitems;

    $.each(controller.stations.snames,function (i,station) {
        if (controller.options.mas === i+1) {
            list += "<li data-icon='false' class='center"+((controller.status[i]) ? " green" : "")+"'>"+station+" ("+_("Master")+")</li>";
        } else {
            list += "<li data-icon='false'><a class='mm_station center"+((controller.status[i]) ? " green" : "")+"'>"+station+"</a></li>";
        }
    });

    mmlist = $("<ul data-role='listview' data-inset='true' id='mm_list'>"+list+"</ul>"),
    listitems = mmlist.children("li").slice(1);
    mmlist.find(".mm_station").on("vclick",toggle);
    page.find(".ui-content").append(mmlist);

    autoOff.on("click",function(){
        var dur = $(this),
            name = page.find("label[for='"+dur.attr("id")+"']").text();

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
            storage.set({"autoOff":result});
        },32768);

        return false;
    });
    page.find("#mmm").flipswitch().on("change",flipSwitched);
    storage.get("autoOff",function(data){
        if (!data.autoOff) {
            return;
        }
        autoOff.val(data.autoOff);
        autoOff.text(dhms2str(sec2dhms(data.autoOff)));
    });

    page.one("pagehide",function(){
        page.remove();
    });

    page.appendTo("body");
}

// Runonce functions
function get_runonce() {
    var list = "<p class='center'>"+_("Zero value excludes the station from the run-once program.")+"</p>",
        runonce = $("<div data-role='page' id='runonce'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false'>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Run-Once")+"</h3>" +
                "<button data-icon='check' class='ui-btn-right'>"+_("Submit")+"</button>" +
            "</div>" +
            "<div class='ui-content' role='main' id='runonce_list'>" +
            "</div>" +
        "</div>"),
        updateLastRun = function(data) {
            rprogs.l = data;
            runonce.find("#rprog").prepend("<option value='l' selected='selected'>"+_("Last Used Program")+"</option>");
            fill_runonce(data);
        },
        reset_runonce = function() {
            runonce.find("[id^='zone-']").val(0).text("0s").removeClass("green");
            return false;
        },
        fill_runonce = function(data) {
            runonce.find("[id^='zone-']").each(function(a,b){
                if (controller.options.mas === a+1) {
                    return;
                }

                var ele = $(b);
                ele.val(data[a]).text(dhms2str(sec2dhms(data[a])));
                if (data[a] > 0) {
                    ele.addClass("green");
                } else {
                    ele.removeClass("green");
                }
            });
        },
        i, quickPick, progs, rprogs, z, program;

    runonce.find("div[data-role='header'] > .ui-btn-right").on("click",submit_runonce);

    progs = [];
    if (controller.programs.pd.length) {
        for (z=0; z < controller.programs.pd.length; z++) {
            program = read_program(controller.programs.pd[z]);
            var prog = [],
                set_stations = program.stations.split("");

            for (i=0;i<controller.stations.snames.length;i++) {
                prog.push((parseInt(set_stations[i])) ? program.duration : 0);
            }
            progs.push(prog);
        }
    }
    rprogs = progs;

    quickPick = "<select data-mini='true' name='rprog' id='rprog'><option value='s' selected='selected'>"+_("Quick Programs")+"</option>";
    for (i=0; i<progs.length; i++) {
        quickPick += "<option value='"+i+"'>"+_("Program")+" "+(i+1)+"</option>";
    }
    quickPick += "</select>";
    list += quickPick+"<form>";
    $.each(controller.stations.snames,function(i, station) {
        if (controller.options.mas === i+1) {
            list += "<div class='ui-field-contain duration-input'><label for='zone-"+i+"'>"+station+":</label><button disabled='true' data-mini='true' name='zone-"+i+"' id='zone-"+i+"' value='0'>Master</button></div>";
        } else {
            list += "<div class='ui-field-contain duration-input'><label for='zone-"+i+"'>"+station+":</label><button data-mini='true' name='zone-"+i+"' id='zone-"+i+"' value='0'>0s</button></div>";
        }
    });

    list += "</form><a class='ui-btn ui-corner-all ui-shadow rsubmit' href='#'>"+_("Submit")+"</a><a class='ui-btn ui-btn-b ui-corner-all ui-shadow rreset' href='#'>"+_("Reset")+"</a>";

    runonce.find(".ui-content").html(list);

    if (typeof controller.settings.rodur === "object") {
        var total = 0;

        for (i=0; i<controller.settings.rodur.length; i++) {
            total += controller.settings.rodur[i];
        }

        if (total !== 0) {
            updateLastRun(controller.settings.rodur);
        }
    } else {
        storage.get("runonce",function(data){
            data = data.runonce;
            if (data) {
                data = JSON.parse(data);
                updateLastRun(data);
            }
        });
    }

    runonce.find("#rprog").on("change",function(){
        var prog = $(this).val();
        if (prog === "s") {
            reset_runonce();
            return;
        }
        if (typeof rprogs[prog] === "undefined") {
            return;
        }
        fill_runonce(rprogs[prog]);
    });

    runonce.on("click",".rsubmit",submit_runonce).on("click",".rreset",reset_runonce);

    runonce.find("[id^='zone-']").on("click",function(){
        var dur = $(this),
            name = runonce.find("label[for='"+dur.attr("id")+"']").text().slice(0,-1);

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
            if (result > 0) {
                dur.addClass("green");
            } else {
                dur.removeClass("green");
            }
        },65535);

        return false;
    });

    runonce.one("pagehide",function(){
        runonce.remove();
    });

    runonce.appendTo("body");
}

function submit_runonce(runonce) {
    if (!(runonce instanceof Array)) {
        runonce = [];
        $("#runonce").find("[id^='zone-']").each(function(a,b){
            runonce.push(parseInt($(b).val()));
        });
        runonce.push(0);
    }
    storage.set({"runonce":JSON.stringify(runonce)});
    send_to_os("/cr?pw=&t="+JSON.stringify(runonce)).done(function(){
        $.mobile.document.one("pageshow",function(){
            showerror(_("Run-once program has been scheduled"));
        });
        update_controller_status();
        update_controller_settings();
        goBack();
    });
}

// Preview functions
function get_preview() {
    var now = new Date(),
        date = now.toISOString().slice(0,10),
        page = $("<div data-role='page' id='preview'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false'>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Program Preview")+"</h3>" +
            "</div>" +
            "<div class='ui-content' role='main'>" +
                "<div id='preview_header'>" +
                    "<button class='preview-minus ui-btn ui-btn-icon-notext ui-icon-carat-l btn-no-border'></button>" +
                    "<input class='center' type='date' name='preview_date' id='preview_date' value='"+date+"' />" +
                    "<button class='preview-plus ui-btn ui-btn-icon-notext ui-icon-carat-r btn-no-border'></button>" +
                "</div>" +
                "<div id='timeline'></div>" +
                "<div data-role='controlgroup' data-type='horizontal' id='timeline-navigation'>" +
                    "<a class='ui-btn ui-corner-all ui-icon-plus ui-btn-icon-notext btn-no-border' title='"+_("Zoom in")+"'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-minus ui-btn-icon-notext btn-no-border' title='"+_("Zoom out")+"'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-carat-l ui-btn-icon-notext btn-no-border' title='"+_("Move left")+"'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-carat-r ui-btn-icon-notext btn-no-border' title='"+_("Move right")+"'></a>" +
                "</div>" +
            "</div>" +
        "</div>"),
        navi = page.find("#timeline-navigation"),
        preview_data, process_programs, check_match, run_sched, time_to_text, changeday, render, day;

    date = date.split("-");
    day = new Date(date[0],date[1]-1,date[2]);

    process_programs = function (month,day,year) {
        preview_data = [];
        var devday = Math.floor(controller.settings.devt/(60*60*24)),
            simminutes = 0,
            simt = Date.UTC(year,month-1,day,0,0,0,0),
            simday = (simt/1000/3600/24)>>0,
            st_array = new Array(controller.settings.nbrd*8),
            pid_array = new Array(controller.settings.nbrd*8),
            et_array = new Array(controller.settings.nbrd*8),
            busy, match_found, prog;

        for(var sid=0;sid<controller.settings.nbrd;sid++) {
            st_array[sid]=0;pid_array[sid]=0;et_array[sid]=0;
        }

        do {
            busy=0;
            match_found=0;
            for(var pid=0;pid<controller.programs.pd.length;pid++) {
                prog=controller.programs.pd[pid];
                if(check_match(prog,simminutes,simt,simday,devday)) {
                    for(sid=0;sid<controller.settings.nbrd*8;sid++) {
                        var bid=sid>>3;var s=sid%8;
                        if (controller.options.mas===(sid+1)) {
                            continue; // skip master station
                        }
                        if(prog[7+bid]&(1<<s)) {
                            et_array[sid]=prog[6]*controller.options.wl/100>>0;
                            pid_array[sid]=pid+1;
                            match_found=1;
                        }
                    }
              }
            }
            if(match_found) {
                var acctime=simminutes*60;
                if(controller.options.seq) {
                    for(sid=0;sid<controller.settings.nbrd*8;sid++) {
                        if(et_array[sid]) {
                            st_array[sid]=acctime;acctime+=et_array[sid];
                            et_array[sid]=acctime;acctime+=controller.options.sdt;
                            busy=1;
                        }
                    }
                } else {
                    for(sid=0;sid<controller.settings.nbrd*8;sid++) {
                        if(et_array[sid]) {
                            st_array[sid]=simminutes*60;
                            et_array[sid]=simminutes*60+et_array[sid];
                            busy=1;
                        }
                    }
                }
            }
            if (busy) {
                var endminutes=run_sched(simminutes*60,st_array,pid_array,et_array,simt)/60>>0;
                if (controller.options.seq&&simminutes!==endminutes) {
                    simminutes=endminutes;
                } else {
                    simminutes++;
                }
                for(sid=0;sid<controller.settings.nbrd*8;sid++) {
                    st_array[sid]=0;pid_array[sid]=0;et_array[sid]=0;
                }
            } else {
                simminutes++;
            }
        } while(simminutes<24*60);
    };

    check_match = function (prog,simminutes,simt,simday,devday) {
        if(prog[0]===0) {
            return 0;
        }
        if ((prog[1]&0x80)&&(prog[2]>1)) {
            var dn=prog[2],
                drem=prog[1]&0x7f;
            if((simday%dn)!==((devday+drem)%dn)) {
                return 0;
            }
        } else {
            var date = new Date(simt);
            var wd=(date.getUTCDay()+6)%7;
            if((prog[1]&(1<<wd))===0) {
                return 0;
            }
            var dt=date.getUTCDate();
            if((prog[1]&0x80)&&(prog[2]===0)) {
                if((dt%2)!==0) {
                    return 0;
                }
            }
            if((prog[1]&0x80)&&(prog[2]===1)) {
                if(dt===31 || (dt===29 && date.getUTCMonth()===1) || (dt%2)!==1) {
                    return 0;
                }
            }
        }
        if(simminutes<prog[3] || simminutes>prog[4]) {
            return 0;
        }
        if(prog[5]===0) {
            return 0;
        }
        if(((simminutes-prog[3])/prog[5]>>0)*prog[5] === (simminutes-prog[3])) {
            return 1;
        }
        return 0;
    };

    run_sched = function (simseconds,st_array,pid_array,et_array,simt) {
        var endtime=simseconds;
        for(var sid=0;sid<controller.settings.nbrd*8;sid++) {
            if(pid_array[sid]) {
                if(controller.options.seq===1) {
                    if((controller.options.mas>0)&&(controller.options.mas!==sid+1)&&(controller.stations.masop[sid>>3]&(1<<(sid%8)))) {
                        preview_data.push({
                            "start": (st_array[sid]+controller.options.mton),
                            "end": (et_array[sid]+controller.options.mtof),
                            "content":"",
                            "className":"master",
                            "shortname":"M",
                            "group":"Master"
                        });
                    }
                    time_to_text(sid,st_array[sid],pid_array[sid],et_array[sid],simt);
                    endtime=et_array[sid];
                } else {
                    time_to_text(sid,simseconds,pid_array[sid],et_array[sid],simt);
                    if((controller.options.mas>0)&&(controller.options.mas!==sid+1)&&(controller.stations.masop[sid>>3]&(1<<(sid%8)))) {
                        endtime=(endtime>et_array[sid])?endtime:et_array[sid];
                    }
                }
            }
        }
        if(controller.options.seq===0&&controller.options.mas>0) {
            preview_data.push({
                "start": simseconds,
                "end": endtime,
                "content":"",
                "className":"master",
                "shortname":"M",
                "group":"Master"
            });
        }
        return endtime;
    };

    time_to_text = function (sid,start,pid,end,simt) {
        var className = "program-"+((pid+3)%4);
        if ((controller.settings.rd!==0)&&(simt+start+(controller.options.tz-48)*900<=controller.settings.rdst*1000)) {
            className="delayed";
        }
        preview_data.push({
            "start": start,
            "end": end,
            "className":className,
            "content":"P"+pid,
            "shortname":"S"+(sid+1),
            "group": controller.stations.snames[sid]
        });
    };

    changeday = function (dir) {
        day.setDate(day.getDate() + dir);

        var m = pad(day.getMonth()+1),
            d = pad(day.getDate()),
            y = day.getFullYear();

        date = [y,m,d];
        page.find("#preview_date").val(date.join("-"));
        render();
    };

    render = function() {
        process_programs(date[1],date[2],date[0]);

        navi.hide();

        if (!preview_data.length) {
            page.find("#timeline").html("<p align='center'>"+_("No stations set to run on this day.")+"</p>");
            return;
        }
        var shortnames = [];
        $.each(preview_data, function(){
            this.start = new Date(date[0],date[1]-1,date[2],0,0,this.start);
            this.end = new Date(date[0],date[1]-1,date[2],0,0,this.end);
            shortnames[this.group] = this.shortname;
        });
        var options = {
            "width":  "100%",
            "editable": false,
            "axisOnTop": true,
            "eventMargin": 10,
            "eventMarginAxis": 0,
            "min": new Date(date[0],date[1]-1,date[2],0),
            "max": new Date(date[0],date[1]-1,date[2],24),
            "selectable": true,
            "showMajorLabels": false,
            "zoomMax": 1000 * 60 * 60 * 24,
            "zoomMin": 1000 * 60 * 60,
            "groupsChangeable": false,
            "showNavigation": false,
            "groupsOrder": "none",
            "groupMinHeight": 20
        };

        var timeline = new links.Timeline(page.find("#timeline")[0],options);
        links.events.addListener(timeline, "select", function(){
            var sel = timeline.getSelection();

            if (sel.length) {
                if (typeof sel[0].row !== "undefined") {
                    changePage("#programs",{
                        "programToExpand": parseInt(timeline.getItem(sel[0].row).content.substr(1)) - 1
                    });
                }
            }
        });

        $.mobile.window.off("resize").on("resize",function(){
            timeline.redraw();
        });

        timeline.draw(preview_data);

        if ($.mobile.window.width() <= 480) {
            var currRange = timeline.getVisibleChartRange();
            if ((currRange.end.getTime() - currRange.start.getTime()) > 6000000) {
                timeline.setVisibleChartRange(currRange.start,new Date(currRange.start.getTime()+6000000));
            }
        }

        page.find(".timeline-groups-text").each(function(a,b){
            var stn = $(b);
            var name = shortnames[stn.text()];
            stn.attr("data-shortname",name);
        });

        page.find(".timeline-groups-axis").children().first().html("<div class='timeline-axis-text center dayofweek' data-shortname='"+getDayName(day,"short")+"'>"+getDayName(day)+"</div>");

        if (isAndroid) {
            navi.find(".ui-icon-plus").off("click").on("click",function(){
                timeline.zoom(0.4);
                return false;
            });
            navi.find(".ui-icon-minus").off("click").on("click",function(){
                timeline.zoom(-0.4);
                return false;
            });
            navi.find(".ui-icon-carat-l").off("click").on("click",function(){
                timeline.move(-0.2);
                return false;
            });
            navi.find(".ui-icon-carat-r").off("click").on("click",function(){
                timeline.move(0.2);
                return false;
            });
            navi.show();
        }
    };

    page.find("#preview_date").on("change",function(){
        date = this.value.split("-");
        day = new Date(date[0],date[1]-1,date[2]);
        render();
    });
    page.find(".preview-minus").on("vclick",function(){
        changeday(-1);
    });
    page.find(".preview-plus").on("vclick",function(){
        changeday(1);
    });

    page.one({
        pagehide: function(){
            $.mobile.window.off("resize");
            page.remove();
        },
        pageshow: render
    });

    page.appendTo("body");
}

// Logging functions
function get_logs() {
    var now = new Date(),
        logs = $("<div data-role='page' id='logs'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Logs")+"</h3>" +
                "<a href='#' data-icon='refresh' class='ui-btn-right'>"+_("Refresh")+"</a>" +
            "</div>" +
            "<div class='ui-content' role='main'>" +
                "<fieldset data-role='controlgroup' data-type='horizontal' data-mini='true' class='log_type'>" +
                    "<input data-mini='true' type='radio' name='log_type' id='log_graph' value='graph' checked='checked' />" +
                    "<label for='log_graph'>"+_("Graph")+"</label>" +
                    "<input data-mini='true' type='radio' name='log_type' id='log_table' value='table' />" +
                    "<label for='log_table'>"+_("Table")+"</label>" +
                "</fieldset>" +
                "<div id='placeholder'></div>" +
                "<div id='zones'>" +
                "</div>" +
                "<fieldset data-role='collapsible' data-mini='true' id='log_options' class='center'>" +
                    "<legend>"+_("Options")+"</legend>" +
                    "<fieldset data-role='controlgroup' data-type='horizontal' id='graph_sort'>" +
                      "<p class='tight'>"+_("Grouping:")+"</p>" +
                      "<input data-mini='true' type='radio' name='g' id='radio-choice-d' value='n' checked='checked' />" +
                      "<label for='radio-choice-d'>"+_("None")+"</label>" +
                      "<input data-mini='true' type='radio' name='g' id='radio-choice-a' value='h' />" +
                      "<label for='radio-choice-a'>"+_("Hour")+"</label>" +
                      "<input data-mini='true' type='radio' name='g' id='radio-choice-b' value='d' />" +
                      "<label for='radio-choice-b'>"+_("DOW")+"</label>" +
                      "<input data-mini='true' type='radio' name='g' id='radio-choice-c' value='m' />" +
                      "<label for='radio-choice-c'>"+_("Month")+"</label>" +
                    "</fieldset>" +
                    "<div class='ui-field-contain'>" +
                        "<label for='log_start'>"+_("Start:")+"</label>" +
                        "<input data-mini='true' type='date' id='log_start' value='"+(new Date(now.getTime() - 604800000).toISOString().slice(0,10))+"' />" +
                        "<label for='log_end'>"+_("End:")+"</label>" +
                        "<input data-mini='true' type='date' id='log_end' value='"+(now.toISOString().slice(0,10))+"' />" +
                    "</div>" +
                    "<a data-role='button' class='email_logs' href='#' data-mini='true'>"+_("Export via Email")+"</a>" +
                "</fieldset>" +
                "<div id='logs_list' class='center'>" +
                "</div>" +
            "</div>" +
        "</div>"),
        placeholder = logs.find("#placeholder"),
        logs_list = logs.find("#logs_list"),
        zones = logs.find("#zones"),
        graph_sort = logs.find("#graph_sort"),
        log_options = logs.find("#log_options"),
        data = [],
        stations = $.merge($.merge([],controller.stations.snames),[_("Rain Sensor"),_("Rain Delay")]),
        seriesChange = function() {
            var grouping = logs.find("input:radio[name='g']:checked").val(),
                pData = [],
                sortedData, options, plot;

            placeholder.empty();

            sortedData = sortData("graph",grouping);

            zones.find("td[zone_num]:not('.unchecked')").each(function() {
                var key = $(this).attr("zone_num");
                if (!sortedData[key].length) {
                    sortedData[key]=[[0,0]];
                }
                if (key && sortedData[key]) {
                    if ((grouping === "h") || (grouping === "m") || (grouping === "d")) {
                        pData.push({
                            data:sortedData[key],
                            label:$(this).attr("name"),
                            color:parseInt(key),
                            bars: { order:key, show: true, barWidth:0.08}
                        });
                    } else if (grouping === "n") {
                        pData.push({
                            data:sortedData[key],
                            label:$(this).attr("name"),
                            color:parseInt(key),
                            lines: {
                                show: true,
                                fill: true
                            }
                        });
                    }
                }
            });

            // Plot the data
            if (grouping==="h") {
                options = {
                    grid: { hoverable: true },
                    yaxis: {min: 0, tickFormatter: function(val, axis) { return val < axis.max ? Math.round(val*100)/100 : "min";} },
                    xaxis: { min: 0, max: 24, tickDecimals: 0, tickSize: 1 }
                };
            } else if (grouping==="d") {
                options = {
                    grid: { hoverable: true },
                    yaxis: {min: 0, tickFormatter: function(val, axis) { return val < axis.max ? Math.round(val*100)/100 : "min";} },
                    xaxis: { tickDecimals: 0, min: -0.4, max: 6.4,
                    tickFormatter: function(v) { var dow=[_("Sun"),_("Mon"),_("Tue"),_("Wed"),_("Thr"),_("Fri"),_("Sat")]; return dow[v]; } }
                };
            } else if (grouping==="m") {
                options = {
                    grid: { hoverable: true },
                    yaxis: {min: 0, tickFormatter: function(val, axis) { return val < axis.max ? Math.round(val*100)/100 : "min";} },
                    xaxis: { tickDecimals: 0, min: 0.6, max: 12.4, tickSize: 1,
                    tickFormatter: function(v) { var mon=["",_("Jan"),_("Feb"),_("Mar"),_("Apr"),_("May"),_("Jun"),_("Jul"),_("Aug"),_("Sep"),_("Oct"),_("Nov"),_("Dec")]; return mon[v]; } }
                };
            } else if (grouping==="n") {
                options = {
                    grid: { hoverable: true },
                    yaxis: {min: 0, tickFormatter: function(val, axis) { return val < axis.max ? Math.round(val*100)/100 : "min";} },
                    xaxis: { mode: "time", timeformat: "%b %d %H:%M", min:sortedData.min.getTime(), max:sortedData.max.getTime()}
                };
            }

            plot = $.plot(placeholder, pData, options);
        },
        sortData = function(type,grouping) {
            var sortedData = [],
                max, min;

            if (type === "graph") {
                switch (grouping) {
                        case "h":
                            for (i=0; i<stations.length; i++) {
                                sortedData[i] = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[21,0],[22,0],[23,0]];
                            }
                            break;
                        case "m":
                            for (i=0; i<stations.length; i++) {
                                sortedData[i] = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0]];
                            }
                            break;
                        case "d":
                            for (i=0; i<stations.length; i++) {
                                sortedData[i] = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0]];
                            }
                            break;
                        case "n":
                            for (i=0; i<stations.length; i++) {
                                sortedData[i] = [];
                            }
                            break;
                }
            } else {
                for (i=0; i<stations.length; i++) {
                    sortedData[i] = [];
                }
            }

            $.each(data,function(a,b){
                var stamp = parseInt(b[3] * 1000),
                    station = b[1],
                    date = new Date(stamp),
                    utc = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),  date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()),
                    duration = parseInt(b[2]/60),
                    key;

                if (typeof station === "string") {
                    if (station === "rs") {
                        station = stations.length - 2;
                    } else if (station === "rd") {
                        station = stations.length - 1;
                    }
                } else if (typeof station === "number" && station>stations.length-2) {
                    return;
                }

                if (type === "graph") {
                    switch (grouping) {
                        case "h":
                            key = date.getUTCHours();
                            break;
                        case "m":
                            key = date.getUTCMonth() + 1;
                            break;
                        case "d":
                            key = date.getUTCDay();
                            break;
                        case "n":
                            sortedData[station].push([stamp-1000,0]);
                            sortedData[station].push([stamp,duration]);
                            sortedData[station].push([stamp+(duration*60*1000),0]);
                            break;
                    }

                    if (grouping !== "n" && duration > 0) {
                        sortedData[station][key][1] += duration;
                    }

                    if (min === undefined || min > date) {
                        min = date;
                    }
                    if (max === undefined || max < date) {
                        max = new Date(date.getTime() + (duration*100*1000)+1);
                    }
                } else {
                    sortedData[station].push([utc.getTime(),dhms2str(sec2dhms(parseInt(b[2])))]);
                }
            });
            if (type === "graph") {
                sortedData.min = min;
                sortedData.max = max;
            }

            return sortedData;
        },
        toggleZone = function() {
            var zone = $(this);
            if (zone.hasClass("legendColorBox")) {
                zone.find("div div").toggleClass("hideZone");
                zone.next().toggleClass("unchecked");
            } else if (zone.hasClass("legendLabel")) {
                zone.prev().find("div div").toggleClass("hideZone");
                zone.toggleClass("unchecked");
            }
            seriesChange();
        },
        showArrows = function() {
            var height = zones.height(),
                sleft = zones.scrollLeft(),
                right = $("#graphScrollRight"),
                left = $("#graphScrollLeft");

            if (sleft > 13) {
                left.show().css("margin-top",(height/2)-12.5);
            } else {
                left.hide();
            }
            var total = zones.find("table").width(), container = zones.width();
            if ((total-container) > 0 && sleft < ((total-container) - 13)) {
                right.show().css({
                    "margin-top":(height/2)-12.5,
                    "left":container
                });
            } else {
                right.hide();
            }
        },
        success = function(items){
            if (items.length < 1) {
                $.mobile.loading("hide");
                reset_logs_page();
                return;
            }

            data = items;
            updateView();

            objToEmail(".email_logs",data);

            $.mobile.loading("hide");
        },
        updateView = function() {
            if ($("#log_graph").prop("checked")) {
                prepGraph();
            } else {
                prepTable();
            }
        },
        prepGraph = function() {
            if (data.length < 1) {
                reset_logs_page();
                return;
            }

            logs_list.empty().hide();
            var state = ($.mobile.window.height() > 680) ? "expand" : "collapse";
            setTimeout(function(){log_options.collapsible(state);},100);
            placeholder.empty();
            placeholder.show();
            var freshLoad = zones.find("table").length;
            zones.show();
            graph_sort.show();
            if (!freshLoad) {
                var output = "<div class='ui-btn ui-btn-icon-notext ui-icon-carat-l btn-no-border' id='graphScrollLeft'></div><div class='ui-btn ui-btn-icon-notext ui-icon-carat-r btn-no-border' id='graphScrollRight'></div><table class='smaller'><tbody><tr>";
                for (i=0; i<stations.length; i++) {
                    output += "<td class='legendColorBox'><div><div></div></div></td><td id='z"+i+"' zone_num="+i+" name='"+stations[i] + "' class='legendLabel'>"+stations[i]+"</td>";
                }
                output += "</tr></tbody></table>";
                zones.empty().append(output).enhanceWithin();
                zones.find("td").on("click",toggleZone);
                zones.find("#graphScrollLeft,#graphScrollRight").on("click",function(){
                    var dir = ($(this).attr("id") === "graphScrollRight") ? "+=" : "-=",
                        w = zones.width();
                    zones.animate({scrollLeft: dir+w});
                });
            }
            seriesChange();
            i = 0;
            if (!freshLoad) {
                zones.find("td.legendColorBox div div").each(function(a,b){
                    var border = $(placeholder.find(".legendColorBox div div").get(i)).css("border");
                    //Firefox and IE fix
                    if (border === "") {
                        border = $(placeholder.find(".legendColorBox div div").get(i)).attr("style").split(";");
                        $.each(border,function(a,b){
                            var c = b.split(":");
                            if (c[0] === "border") {
                                border = c[1];
                                return false;
                            }
                        });
                    }
                    $(b).css("border",border);
                    i++;
                });
                showArrows();
            }
        },
        prepTable = function(){
            if (data.length < 1) {
                reset_logs_page();
                return;
            }

            placeholder.empty().hide();

            var table_header = "<table><thead><tr><th data-priority='1'>"+_("Runtime")+"</th><th data-priority='2'>"+_("Date/Time")+"</th></tr></thead><tbody>",
                html = "<div data-role='collapsible-set' data-inset='true' data-theme='b' data-collapsed-icon='arrow-d' data-expanded-icon='arrow-u'>",
                sortedData = sortData("table"),
                ct, k;

            zones.hide();
            graph_sort.hide();
            logs_list.show();

            for (i=0; i<sortedData.length; i++) {
                ct=sortedData[i].length;
                if (ct === 0) {
                    continue;
                }
                html += "<div data-role='collapsible' data-collapsed='true'><h2><div class='ui-btn-up-c ui-btn-corner-all custom-count-pos'>"+ct+" "+((ct === 1) ? _("run") : _("runs"))+"</div>"+stations[i]+"</h2>"+table_header;
                for (k=0; k<sortedData[i].length; k++) {
                    var date = new Date(sortedData[i][k][0]);
                    html += "<tr><td>"+sortedData[i][k][1]+"</td><td>"+dateToString(date,false)+"</td></tr>";
                }
                html += "</tbody></table></div>";
            }

            log_options.collapsible("collapse");
            logs_list.html(html+"</div>").enhanceWithin();
            fixInputClick(logs_list);
        },
        reset_logs_page = function() {
            placeholder.empty().hide();
            log_options.collapsible("expand");
            zones.empty().hide();
            graph_sort.hide();
            logs_list.show().html(_("No entries found in the selected date range"));
        },
        fail = function(){
            $.mobile.loading("hide");
            reset_logs_page();
        },
        dates = function() {
            var sDate = $("#log_start").val().split("-"),
                eDate = $("#log_end").val().split("-");
            return {
                start: new Date(sDate[0],sDate[1]-1,sDate[2]),
                end: new Date(eDate[0],eDate[1]-1,eDate[2])
            };
        },
        parms = function() {
            return "start=" + (dates().start.getTime() / 1000) + "&end=" + ((dates().end.getTime() / 1000) + 86340);
        },
        requestData = function() {
            var endtime = dates().end.getTime() / 1000,
                starttime = dates().start.getTime() / 1000;

            if (endtime < starttime) {
                fail();
                showerror(_("Start time cannot be greater than end time"));
                return;
            }

            var delay = 0;
            $.mobile.loading("show");

            if (!isOSPi() && (endtime - starttime) > 604800) {
                showerror(_("The requested time span exceeds the maxiumum of 7 days and has been adjusted"),3500);
                var nDate = dates().start;
                nDate.setDate(nDate.getDate() + 7);
                var m = pad(nDate.getMonth()+1);
                var d = pad(nDate.getDate());
                $("#log_end").val(nDate.getFullYear() + "-" + m + "-" + d);
                delay = 500;
            }
            setTimeout(function(){
                send_to_os("/jl?"+parms(),"json").then(success,fail);
            },delay);
        },
        logtimeout, hovertimeout, i;

    logs.find("input").blur();
    $.mobile.loading("show");

    //Update left/right arrows when zones are scrolled on log page
    zones.scroll(showArrows);

    $.mobile.window.resize(function(){
        showArrows();
        seriesChange();
    });

    //Automatically update the log viewer when changing the date range
    if (isiOS) {
        logs.find("#log_start,#log_end").on("blur",requestData);
    } else {
        logs.find("#log_start,#log_end").change(function(){
            clearTimeout(logtimeout);
            logtimeout = setTimeout(requestData,1000);
        });
    }

    //Automatically update log viewer when switching graphing method
    graph_sort.find("input[name='g']").change(function(){
        seriesChange();
    });

    //Bind refresh button
    logs.find("div[data-role='header'] > .ui-btn-right").on("click",requestData);

    //Bind view change buttons
    logs.find("input:radio[name='log_type']").change(updateView);

    //Show tooltip (station name) when point is clicked on the graph
    placeholder.on("plothover",function(e,p,item) {
        $("#tooltip").remove();
        clearTimeout(hovertimeout);
        if (item) {
            hovertimeout = setTimeout(function(){showTooltip(item.pageX, item.pageY, item.series.label, item.series.color);}, 100);
        }
    });

    logs.one({
        pagehide: function(){
            $.mobile.window.off("resize");
            logs.remove();
        },
        pageshow: requestData
    });

    logs.appendTo("body");
}

// Program management functions
function get_programs(pid) {
    var programs = $("<div data-role='page' id='programs'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("Programs")+"</h3>" +
                "<a href='#addprogram' data-icon='plus' class='ui-btn-right'>"+_("Add")+"</a>" +
            "</div>" +
            "<div class='ui-content' role='main' id='programs_list'>" +
                make_all_programs() +
            "</div>" +
        "</div>");

    programs.find("[id^=program-]").on({
        collapsiblecollapse: function(){
            $(this).find(".ui-collapsible-content").empty();
        },
        collapsibleexpand: function(){
            expandProgram($(this));
        }
    });

    programs
    .one("pagehide",function(){
        programs.remove();
    })
    .one("pagebeforeshow",function(){
        if (typeof pid !== "number" && controller.programs.pd.length === 1) {
            pid = 0;
        }

        if (typeof pid === "number") {
            programs.find("fieldset[data-collapsed='false']").collapsible("collapse");
            $("#program-"+pid).collapsible("expand");
        }
    });

    programs.appendTo("body");

    update_program_header();
}

function expandProgram(program) {
    var id = parseInt(program.attr("id").split("-")[1]),
        html = $(make_program(id));

    program.find(".ui-collapsible-content").html(html).enhanceWithin();

    program.find("input[name^='rad_days']").on("change",function(){
        var progid = $(this).attr("id").split("-")[1], type = $(this).val().split("-")[0], old;
        type = type.split("_")[1];
        if (type === "n") {
            old = "week";
        } else {
            old = "n";
        }
        $("#input_days_"+type+"-"+progid).show();
        $("#input_days_"+old+"-"+progid).hide();
    });

    program.find("[id^='submit-']").on("click",function(){
        submit_program($(this).attr("id").split("-")[1]);
        return false;
    });

    program.find("[id^='duration-'],[id^='interval-']").on("click",function(){
        var dur = $(this),
            granularity = dur.attr("id").match("interval") ? 1 : 0,
            name = program.find("label[for='"+dur.attr("id")+"']").text();

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
        },65535,granularity);
        return false;
    });

    program.find("[id^='s_checkall-']").on("click",function(){
        var id = $(this).attr("id").split("-")[1];
        program.find("[id^='station_'][id$='-"+id+"']").prop("checked",true).checkboxradio("refresh");
        return false;
    });

    program.find("[id^='s_uncheckall-']").on("click",function(){
        var id = $(this).attr("id").split("-")[1];
        program.find("[id^='station_'][id$='-"+id+"']").prop("checked",false).checkboxradio("refresh");
        return false;
    });

    program.find("[id^='delete-']").on("click",function(){
        delete_program($(this).attr("id").split("-")[1]);
        return false;
    });

    program.find("[id^='run-']").on("click",function(){
        var id = $(this).attr("id").split("-")[1],
            durr = parseInt($("#duration-"+id).val()),
            stations = $("[id^='station_'][id$='-"+id+"']"),
            runonce = [];

        $.each(stations,function(a,b){
            if ($(b).is(":checked")) {
                runonce.push(durr);
            } else {
                runonce.push(0);
            }
        });
        runonce.push(0);
        submit_runonce(runonce);
        return false;
    });

    fixInputClick(program);
}

// Translate program array into easier to use data
function read_program(program) {
    var days0 = program[1],
        days1 = program[2],
        even = false,
        odd = false,
        interval = false,
        days = "",
        stations = "",
        newdata = {};

    newdata.en = program[0];
    newdata.start = program[3];
    newdata.end = program[4];
    newdata.interval = program[5];
    newdata.duration = program[6];

    for (var n=0; n < controller.programs.nboards; n++) {
        var bits = program[7+n];
        for (var s=0; s < 8; s++) {
            stations += (bits&(1<<s)) ? "1" : "0";
        }
    }
    newdata.stations = stations;

    if((days0&0x80)&&(days1>1)){
        //This is an interval program
        days=[days1,days0&0x7f];
        interval = true;
    } else {
        //This is a weekly program
        for(var d=0;d<7;d++) {
            if (days0&(1<<d)) {
                days += "1";
            } else {
                days += "0";
            }
        }
        if((days0&0x80)&&(days1===0)) {even = true;}
        if((days0&0x80)&&(days1===1)) {odd = true;}
    }

    newdata.days = days;
    newdata.is_even = even;
    newdata.is_odd = odd;
    newdata.is_interval = interval;

    return newdata;
}

// Translate program ID to it's name
function pidname(pid) {
    var pname = _("Program")+" "+pid;
    if(pid===255||pid===99) {
        pname=_("Manual program");
    }
    if(pid===254||pid===98) {
        pname=_("Run-once program");
    }
    return pname;
}

// Check each program and change the background color to red if disabled
function update_program_header() {
    $("#programs_list").find("[id^=program-]").each(function(a,b){
        var item = $(b),
            heading = item.find(".ui-collapsible-heading-toggle"),
            en = controller.programs.pd[a][0];

        if (en) {
            heading.removeClass("red");
        } else {
            heading.addClass("red");
        }
    });
}

//Make the list of all programs
function make_all_programs() {
    if (controller.programs.pd.length === 0) {
        return "<p class='center'>"+_("You have no programs currently added. Tap the Add button on the top right corner to get started.")+"</p>";
    }
    var list = "<p class='center'>"+_("Click any program below to expand/edit. Be sure to save changes by hitting submit below.")+"</p><div data-role='collapsible-set'>";
    for (var i = 0; i < controller.programs.pd.length; i++) {
        list += "<fieldset id='program-"+i+"' data-role='collapsible'><legend>"+_("Program")+" "+(i+1)+"</legend>";
        list += "</fieldset>";
    }
    return list+"</div>";
}

//Generate a new program view
function fresh_program() {
    var list = "<fieldset id='program-new'>";
    list +=make_program("new");
    list += "</fieldset>";

    return list;
}

function make_program(n) {
    var week = [_("Monday"),_("Tuesday"),_("Wednesday"),_("Thursday"),_("Friday"),_("Saturday"),_("Sunday")],
        list = "",
        days, i, j, set_stations, program;

    if (n === "new") {
        program = {"en":0,"is_interval":0,"is_even":0,"is_odd":0,"duration":0,"interval":0,"start":0,"end":0,"days":[0,0]};
    } else {
        program = read_program(controller.programs.pd[n]);
    }

    if (typeof program.days === "string") {
        days = program.days.split("");
        for(i=days.length;i--;) {
            days[i] = days[i]|0;
        }
    } else {
        days = [0,0,0,0,0,0,0];
    }
    if (typeof program.stations !== "undefined") {
        set_stations = program.stations.split("");
        for(i=set_stations.length;i--;) {
            set_stations[i] = set_stations[i]|0;
        }
    }
    list += "<label for='en-"+n+"'><input data-mini='true' type='checkbox' "+((program.en || n==="new") ? "checked='checked'" : "")+" name='en-"+n+"' id='en-"+n+"'>"+_("Enabled")+"</label>";
    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<input data-mini='true' type='radio' name='rad_days-"+n+"' id='days_week-"+n+"' value='days_week-"+n+"' "+((program.is_interval) ? "" : "checked='checked'")+"><label for='days_week-"+n+"'>"+_("Weekly")+"</label>";
    list += "<input data-mini='true' type='radio' name='rad_days-"+n+"' id='days_n-"+n+"' value='days_n-"+n+"' "+((program.is_interval) ? "checked='checked'" : "")+"><label for='days_n-"+n+"'>"+_("Interval")+"</label>";
    list += "</fieldset><div id='input_days_week-"+n+"' "+((program.is_interval) ? "style='display:none'" : "")+">";

    list += "<div class='center'><p class='tight'>"+_("Restrictions")+"</p><select data-inline='true' data-iconpos='left' data-mini='true' data-native-menu='false' id='days_rst-"+n+"'>";
    list += "<option value='none' "+((!program.is_even && !program.is_odd) ? "selected='selected'" : "")+">"+_("None")+"</option>";
    list += "<option value='odd' "+((!program.is_even && program.is_odd) ? "selected='selected'" : "")+">"+_("Odd Days")+"</option>";
    list += "<option value='even' "+((!program.is_odd && program.is_even) ? "selected='selected'" : "")+">"+_("Even Days")+"</option>";
    list += "</select></div>";

    list += "<div class='center'><p class='tight'>"+_("Days of the Week")+"</p><select "+($.mobile.window.width() > 560 ? "data-inline='true' " : "")+"data-iconpos='left' data-mini='true' multiple='multiple' data-native-menu='false' id='d-"+n+"'><option>"+_("Choose day(s)")+"</option>";
    for (j=0; j<week.length; j++) {
        list += "<option "+((!program.is_interval && days[j]) ? "selected='selected'" : "")+" value='"+j+"'>"+week[j]+"</option>";
    }
    list += "</select></div></div>";

    list += "<div "+((program.is_interval) ? "" : "style='display:none'")+" id='input_days_n-"+n+"' class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label for='every-"+n+"'>"+_("Interval (Days)")+"</label><input data-mini='true' type='number' name='every-"+n+"' pattern='[0-9]*' id='every-"+n+"' value='"+program.days[0]+"'></div>";
    list += "<div class='ui-block-b'><label for='starting-"+n+"'>"+_("Starting In")+"</label><input data-mini='true' type='number' name='starting-"+n+"' pattern='[0-9]*' id='starting-"+n+"' value='"+program.days[1]+"'></div>";
    list += "</div>";

    list += "<fieldset data-role='controlgroup'><legend>"+_("Stations:")+"</legend>";
    for (j=0; j<controller.stations.snames.length; j++) {
        list += "<label for='station_"+j+"-"+n+"'><input data-mini='true' type='checkbox' "+(((typeof set_stations !== "undefined") && set_stations[j]) ? "checked='checked'" : "")+" name='station_"+j+"-"+n+"' id='station_"+j+"-"+n+"'>"+controller.stations.snames[j]+"</label>";
    }
    list += "</fieldset>";

    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<a class='ui-btn ui-mini' name='s_checkall-"+n+"' id='s_checkall-"+n+"'>"+_("Check All")+"</a>";
    list += "<a class='ui-btn ui-mini' name='s_uncheckall-"+n+"' id='s_uncheckall-"+n+"'>"+_("Uncheck All")+"</a>";
    list += "</fieldset>";

    list += "<div class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label for='start-"+n+"'>"+_("Start Time")+"</label><input data-mini='true' type='time' name='start-"+n+"' id='start-"+n+"' value='"+pad(parseInt(program.start/60)%24)+":"+pad(program.start%60)+"'></div>";
    list += "<div class='ui-block-b'><label for='end-"+n+"'>"+_("End Time")+"</label><input data-mini='true' type='time' name='end-"+n+"' id='end-"+n+"' value='"+pad(parseInt(program.end/60)%24)+":"+pad(program.end%60)+"'></div>";
    list += "</div>";

    list += "<div class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label for='duration-"+n+"'>"+_("Station Duration")+"</label><button data-mini='true' name='duration-"+n+"' id='duration-"+n+"' value='"+program.duration+"'>"+dhms2str(sec2dhms(program.duration))+"</button></div>";
    list += "<div class='ui-block-b'><label for='interval-"+n+"'>"+_("Program Interval")+"</label><button data-mini='true' name='interval-"+n+"' id='interval-"+n+"' value='"+program.interval*60+"'>"+dhms2str(sec2dhms(program.interval*60))+"</button></div>";
    list += "</div>";

    if (n === "new") {
        list += "<input data-mini='true' type='submit' name='submit-"+n+"' id='submit-"+n+"' value='"+_("Save New Program")+"'>";
    } else {
        list += "<input data-mini='true' type='submit' name='submit-"+n+"' id='submit-"+n+"' value='"+_("Save Changes to Program")+" "+(n + 1)+"'>";
        list += "<input data-mini='true' type='submit' name='run-"+n+"' id='run-"+n+"' value='"+_("Run Program")+" "+(n + 1)+"'>";
        list += "<input data-mini='true' data-theme='b' type='submit' name='delete-"+n+"' id='delete-"+n+"' value='"+_("Delete Program")+" "+(n + 1)+"'>";
    }
    return list;
}

function add_program() {
    var addprogram = $("<div data-role='page' id='addprogram'>" +
                "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false' data-hide-during-focus=''>" +
                    "<h3>"+_("Add Program")+"</h3>" +
                    "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                    "<button data-icon='check' class='ui-btn-right'>"+_("Submit")+"</button>" +
                "</div>" +
                "<div class='ui-content' role='main' id='newprogram'>" +
                    fresh_program() +
                "</div>" +
            "</div>");

    addprogram.find("div[data-role='header'] > .ui-btn-right").on("click",function(){
        submit_program("new");
    });

    addprogram.find("input[name^='rad_days']").on("change",function(){
        var progid = "new", type = $(this).val().split("-")[0], old;
        type = type.split("_")[1];
        if (type === "n") {
            old = "week";
        } else {
            old = "n";
        }
        $("#input_days_"+type+"-"+progid).show();
        $("#input_days_"+old+"-"+progid).hide();
    });

    addprogram.find("[id^='s_checkall-']").on("click",function(){
        addprogram.find("[id^='station_'][id$='-new']").prop("checked",true).checkboxradio("refresh");
        return false;
    });

    addprogram.find("[id^='s_uncheckall-']").on("click",function(){
        addprogram.find("[id^='station_'][id$='-new']").prop("checked",false).checkboxradio("refresh");
        return false;
    });

    addprogram.find("[id^='submit-']").on("click",function(){
        submit_program("new");
        return false;
    });

    addprogram.find("[id^='duration-'],[id^='interval-']").on("click",function(){
        var dur = $(this),
            granularity = dur.attr("id").match("interval") ? 1 : 0,
            name = addprogram.find("label[for='"+dur.attr("id")+"']").text();

        showDurationBox(dur.val(),name,function(result){
            dur.val(result);
            dur.text(dhms2str(sec2dhms(result)));
        },65535,granularity);
        return false;
    });

    addprogram.one("pagehide",function() {
        addprogram.remove();
    });

    addprogram.appendTo("body");
}

function delete_program(id) {
    areYouSure(_("Are you sure you want to delete program")+" "+(parseInt(id)+1)+"?", "", function() {
        $.mobile.loading("show");
        send_to_os("/dp?pw=&pid="+id).done(function(){
            $.mobile.loading("hide");
            update_controller_programs(function(){
                changePage("#programs",{showLoadMsg:false});
                showerror(_("Program")+" "+(parseInt(id)+1)+" "+_("deleted"));
            });
        });
    });
}

function submit_program(id) {
    var program = [],
        days=[0,0],
        daysin, i, s;

    program[0] = ($("#en-"+id).is(":checked")) ? 1 : 0;

    if($("#days_week-"+id).is(":checked")) {
        daysin = $("#d-"+id).val();
        daysin = (daysin === null) ? [] : parseIntArray(daysin);
        for(i=0;i<7;i++) {if($.inArray(i,daysin) !== -1) {days[0] |= (1<<i); }}
        if($("#days_rst-"+id).val() === "odd") {days[0]|=0x80; days[1]=1;}
        else if($("#days_rst-"+id).val() === "even") {days[0]|=0x80; days[1]=0;}
    } else if($("#days_n-"+id).is(":checked")) {
        days[1]=parseInt($("#every-"+id).val(),10);
        if(!(days[1]>=2&&days[1]<=128)) {showerror(_("Error: Interval days must be between 2 and 128."));return;}
        days[0]=parseInt($("#starting-"+id).val(),10);
        if(!(days[0]>=0&&days[0]<days[1])) {showerror(_("Error: Starting in days wrong."));return;}
        days[0]|=0x80;
    }
    program[1] = days[0];
    program[2] = days[1];

    var start = $("#start-"+id).val().split(":");
    program[3] = parseInt(start[0])*60+parseInt(start[1]);
    var end = $("#end-"+id).val().split(":");
    program[4] = parseInt(end[0])*60+parseInt(end[1]);

    if(program[3]>program[4]) {showerror(_("Error: Start time must be prior to end time."));return;}

    program[5] = parseInt($("#interval-"+id).val()/60);
    program[6] = parseInt($("#duration-"+id).val());

    var sel = $("[id^=station_][id$=-"+id+"]"),
        total = sel.length,
        nboards = total / 8;


    var stations=[0],station_selected=0,bid, sid;
    for(bid=0;bid<nboards;bid++) {
        stations[bid]=0;
        for(s=0;s<8;s++) {
            sid=bid*8+s;
            if($("#station_"+sid+"-"+id).is(":checked")) {
                stations[bid] |= 1<<s; station_selected=1;
            }
        }
    }
    if(station_selected===0) {showerror(_("Error: You have not selected any stations."));return;}
    program = JSON.stringify(program.concat(stations));
    $.mobile.loading("show");
    if (id === "new") {
        send_to_os("/cp?pw=&pid=-1&v="+program).done(function(){
            $.mobile.loading("hide");
            update_controller_programs(function(){
                $.mobile.document.one("pageshow",function(){
                    showerror(_("Program added successfully"));
                });
                goBack();
            });
        });
    } else {
        send_to_os("/cp?pw=&pid="+id+"&v="+program).done(function(){
            $.mobile.loading("hide");
            update_controller_programs(function(){
                update_program_header();
            });
            showerror(_("Program has been updated"));
        });
    }
}

function raindelay() {
    $.mobile.loading("show");
    send_to_os("/cv?pw=&rd="+$("#delay").val()).done(function(){
        var popup = $("#raindelay");
        popup.popup("close");
        popup.find("form").off("submit");
        $.mobile.loading("hide");
        showLoading("#footer-running");
        $.when(
            update_controller_settings(),
            update_controller_status()
        ).then(check_status);
        showerror(_("Rain delay has been successfully set"));
    });
    return false;
}

// Export and Import functions
function export_config() {
    storage.set({"backup":JSON.stringify(controller)},function(){
        showerror(_("Backup saved on this device"));
    });
}

function import_config(data) {
    var piNames = {1:"tz",2:"ntp",12:"htp",13:"htp2",14:"ar",15:"nbrd",16:"seq",17:"sdt",18:"mas",19:"mton",20:"mtoff",21:"urs",22:"rst",23:"wl",25:"ipas"},
        keyIndex = {"tz":1,"ntp":2,"hp0":12,"hp1":13,"ar":14,"ext":15,"seq":16,"sdt":17,"mas":18,"mton":19,"mtof":20,"urs":21,"rso":22,"wl":23,"ipas":25,"devid":26};

    if (typeof data === "undefined") {
        storage.get("backup",function(newdata){
            if (newdata.backup) {
                import_config(newdata.backup);
            } else {
                showerror(_("No backup available on this device"));
                return;
            }
        });

        return;
    }

    data = JSON.parse(data);

    if (!data.settings) {
        showerror(_("No backup available on this device"));
        return;
    }

    areYouSure(_("Are you sure you want to restore the configuration?"), "", function() {
        $.mobile.loading("show");

        var cs = "/cs?pw=",
            co = "/co?pw=",
            cp_start = "/cp?pw=",
            isPi = isOSPi(),
            i, key;

        for (i in data.options) {
            if (data.options.hasOwnProperty(i) && keyIndex.hasOwnProperty(i)) {
                key = keyIndex[i];
                if ($.inArray(key, [2,14,16,21,22,25]) !== -1 && data.options[i] === 0) {
                    continue;
                }
                if (isPi) {
                    key = piNames[key];
                    if (key === undefined) {
                        continue;
                    }
                } else {
                    key = key;
                }
                co += "&o"+key+"="+data.options[i];
            }
        }
        co += "&"+(isPi?"o":"")+"loc="+data.settings.loc;

        for (i=0; i<data.stations.snames.length; i++) {
            cs += "&s"+i+"="+data.stations.snames[i];
        }

        for (i=0; i<data.stations.masop.length; i++) {
            cs += "&m"+i+"="+data.stations.masop[i];
        }

        if (typeof data.stations.ignore_rain === "object") {
            for (i=0; i<data.stations.ignore_rain.length; i++) {
                cs += "&i"+i+"="+data.stations.ignore_rain[i];
            }
        }

        $.when(
            send_to_os(co),
            send_to_os(cs),
            send_to_os("/dp?pw=&pid=-1"),
            $.each(data.programs.pd,function (i,prog) {
                send_to_os(cp_start+"&pid=-1&v="+JSON.stringify(prog));
            })
        ).then(
            function(){
                update_controller(function(){
                    $.mobile.loading("hide");
                    showerror(_("Backup restored to your device"));
                    update_weather();
                });
            },
            function(){
                $.mobile.loading("hide");
                showerror(_("Unable to import configuration."));
            }
        );
    });
}

// About page
function show_about() {
    var page = $("<div data-role='page' id='about'>" +
            "<div data-theme='b' data-role='header' data-position='fixed' data-tap-toggle='false'>" +
                "<a href='javascript:void(0);' class='ui-btn ui-corner-all ui-shadow ui-btn-left ui-btn-b ui-toolbar-back-btn ui-icon-carat-l ui-btn-icon-left' data-rel='back'>"+_("Back")+"</a>" +
                "<h3>"+_("About")+"</h3>" +
            "</div>" +
            "<div class='ui-content' role='main'>" +
                "<ul data-role='listview' data-inset='true'>" +
                    "<li>" +
                        "<p>"+_("User manual for OpenSprinkler is available at")+" <a class='iab' target='_blank' href='http://rayshobby.net/?page_id=192'>http://rayshobby.net/?page_id=192</a></p>" +
                    "</li>" +
                "</ul>" +
                "<ul data-role='listview' data-inset='true'>" +
                    "<li>" +
                        "<p>"+_("This is open source software: source code and changelog for this application can be found at")+" <a class='iab' target='_blank' href='https://github.com/salbahra/Sprinklers/'>https://github.com/salbahra/Sprinklers/</a></p>" +
                        "<p>"+_("Language localization is crowdsourced using Get Localization available at")+" <a class='iab' target='_blank' href='http://www.getlocalization.com/Sprinklers/'>http://www.getlocalization.com/Sprinklers/</a></p>" +
                    "</li>" +
                "</ul>" +
                "<p class='smaller'>" +
                    _("App Version")+": 1.1.8" +
                    "<br>" +
                    _("Firmware")+": "+getOSVersion() +
                "</p>" +
            "</div>" +
        "</div>");

    page.one("pagehide",function(){
        page.remove();
    });

    page.appendTo("body");
}

// OSPi functions
function isOSPi() {
    if (controller && typeof controller.options.fwv === "string" && controller.options.fwv.search(/ospi/i) !== -1) {
        return true;
    }
    return false;
}

function checkWeatherPlugin() {
    var weather_settings = $(".weather_settings"),
        weather_provider = $(".show-providers");

    curr_wa = [];
    weather_settings.hide();
    if (isOSPi()) {
        storage.get("provider",function(data){
            send_to_os("/wj","json").done(function(results){
                var provider = results.weather_provider;

                // Check if the OSPi has valid weather provider data
                if (typeof provider === "string" && (provider === "yahoo" || provider === "wunderground")) {
                    if (data.provider !== provider) {
                        storage.set({
                            "provider": provider,
                            "wapikey": results.wapikey
                        });

                        // Update the weather based on this information
                        update_weather();
                    }

                    // Hide the weather provider option when the OSPi provides it
                    weather_provider.hide();
                }

                if (typeof results.auto_delay === "string") {
                    curr_wa = results;
                    weather_settings.css("display","");
                }
            });
        });
    } else {
       weather_provider.css("display","");
    }
}

function getOSVersion(fwv) {
    if (!fwv && typeof controller.options === "object") {
        fwv = controller.options.fwv;
    }
    if (typeof fwv === "string" && fwv.search(/ospi/i) !== -1) {
        return fwv;
    } else {
        return (fwv/100>>0)+"."+((fwv/10>>0)%10)+"."+(fwv%10);
    }
}

// Accessory functions for jQuery Mobile
function areYouSure(text1, text2, callback) {
    var popup = $(
        "<div data-role='popup' data-overlay-theme='b' id='sure'>"+
            "<h3 class='sure-1 center'>"+text1+"</h3>"+
            "<p class='sure-2 center'>"+text2+"</p>"+
            "<a class='sure-do ui-btn ui-btn-b ui-corner-all ui-shadow' href='#'>"+_("Yes")+"</a>"+
            "<a class='sure-dont ui-btn ui-corner-all ui-shadow' href='#'>"+_("No")+"</a>"+
        "</div>"
    );

    //Bind buttons
    popup.find(".sure-do").one("click.sure", function() {
        $("#sure").popup("close");
        callback();
        return false;
    });
    popup.find(".sure-dont").one("click.sure", function() {
        $("#sure").popup("close");
        return false;
    });

    popup.one("popupafterclose", function(){
        $(this).popup("destroy").remove();
    }).enhanceWithin();

    $(".ui-page-active").append(popup);

    $("#sure").popup({history: false, positionTo: "window"}).popup("open");
}

function showDurationBox(seconds,title,callback,maximum,granularity) {
    $("#durationBox").popup("destroy").remove();

    title = title || "Duration";
    callback = callback || function(){};
    granularity = granularity || 0;

    var keys = ["days","hours","minutes","seconds"],
        text = [_("Days"),_("Hours"),_("Minutes"),_("Seconds")],
        conv = [86400,3600,60,1],
        total = 4 - granularity,
        start = 0,
        arr = sec2dhms(seconds),
        i;

    if (maximum) {
        for (i=conv.length-1; i>=0; i--) {
            if (maximum < conv[i]) {
                start = i+1;
                total = (conv.length - start) - granularity;
                break;
            }
        }
    }

    var incrbts = "<fieldset class='ui-grid-"+String.fromCharCode(95+(total))+" incr'>",
        inputs = "<div class='ui-grid-"+String.fromCharCode(95+(total))+" inputs'>",
        decrbts = "<fieldset class='ui-grid-"+String.fromCharCode(95+(total))+" decr'>",
        popup = $("<div data-role='popup' id='durationBox' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>"+title+"</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<span>" +
                "</span>" +
            "</div>" +
        "</div>"),
        changeValue = function(pos,dir){
            var input = $(popup.find(".inputs input")[pos]),
                val = parseInt(input.val());

            if ((dir === -1 && val === 0) || (dir === 1 && (getValue() + conv[pos+start]) > maximum)) {
                return;
            }

            input.val(val+dir);
            callback(getValue());
        },
        getValue = function() {
            return dhms2sec({
                "days": parseInt(popup.find(".days").val()) || 0,
                "hours": parseInt(popup.find(".hours").val()) || 0,
                "minutes": parseInt(popup.find(".minutes").val()) || 0,
                "seconds": parseInt(popup.find(".seconds").val()) || 0
            });
        };

    for (i=start; i<conv.length - granularity; i++) {
        incrbts += "<div "+((total > 1) ? "class='ui-block-"+String.fromCharCode(97+i-start)+"'" : "")+"><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>";
        inputs += "<div "+((total > 1) ? "class='ui-block-"+String.fromCharCode(97+i-start)+"'" : "")+"><label>"+_(text[i])+"</label><input class='"+keys[i]+"' type='number' pattern='[0-9]*' value='"+arr[keys[i]]+"'></div>";
        decrbts += "<div "+((total > 1) ? "class='ui-block-"+String.fromCharCode(97+i-start)+"'" : "")+"><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>";
    }

    incrbts += "</fieldset>";
    inputs += "</div>";
    decrbts += "</fieldset>";

    popup.find("span").prepend(incrbts+inputs+decrbts);

    popup.find(".incr").children().on("vclick",function(){
        var pos = $(this).index();
        changeValue(pos,1);
        return false;
    });

    popup.find(".decr").children().on("vclick",function(){
        var pos = $(this).index();
        changeValue(pos,-1);
        return false;
    });

    $(".ui-page-active").append(popup);

    popup
    .css("max-width","350px")
    .popup({
        history: false,
        "positionTo": "window"
    })
    .one("popupafterclose",function(){
        callback(getValue());
        $(this).popup("destroy").remove();
    })
    .enhanceWithin().popup("open");
}

function showMillisecondRequest(milliseconds,title,callback,maximum) {
    $("#msInput").popup("destroy").remove();

    callback = callback || function(){};

    var popup = $("<div data-role='popup' id='msInput' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>"+title+"</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<span>" +
                    "<a class='incr' href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                    "<label>"+_("Milliseconds")+"</label><input type='number' pattern='[0-9]*' value='"+milliseconds+"'>" +
                    "<a class='decr' href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                "</span>" +
            "</div>" +
        "</div>"),
        input = popup.find("input"),
        changeValue = function(dir){
            var val = parseInt(input.val());

            if ((dir === -1 && val === 0) || (dir === 1 && (val + dir) > maximum)) {
                return;
            }

            input.val(val+dir);
            callback(val+dir);
        };

    popup.find(".incr").on("vclick",function(){
        changeValue(1);
        return false;
    });

    popup.find(".decr").on("vclick",function(){
        changeValue(-1);
        return false;
    });

    $(".ui-page-active").append(popup);

    popup
    .css("max-width","150px")
    .popup({
        history: false,
        "positionTo": "window"
    })
    .one("popupafterclose",function(){
        callback(input.val());
        $(this).popup("destroy").remove();
    })
    .enhanceWithin().popup("open");
}

function showDateTimeInput(timestamp,callback) {
    $("#datetimeInput").popup("destroy").remove();

    if (!(timestamp instanceof Date)) {
        timestamp = new Date(timestamp*1000);
        timestamp.setMinutes(timestamp.getMinutes()-timestamp.getTimezoneOffset());
    }

    callback = callback || function(){};

    var keys = ["Month","Date","FullYear","Hours","Minutes"],
        monthNames = [_("Jan"),_("Feb"),_("Mar"),_("Apr"),_("May"),_("Jun"),_("Jul"),_("Aug"),_("Sep"),_("Oct"),_("Nov"),_("Dec")],
        popup = $("<div data-role='popup' id='datetimeInput' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>"+_("Enter Date/Time")+"</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
            "</div>" +
        "</div>"),
        changeValue = function(pos,dir){
            timestamp["setUTC"+pos](timestamp["getUTC"+pos]() + dir);
            callback(new Date(timestamp.getTime()));
            updateContent();
        },
        updateContent = function() {
            var incrbts = "<fieldset class='ui-grid-d incr'>",
                inputs = "<div class='ui-grid-d inputs'>",
                decrbts = "<fieldset class='ui-grid-d decr'>",
                val, mark, i;

            for (i=0; i<5; i++) {
                val = timestamp["getUTC"+keys[i]]();
                mark = "";

                if (keys[i] === "Month") {
                    val = "<p class='center'>"+monthNames[val]+"</p>";
                } else if (keys[i] === "Date") {
                    val = "<p class='center'>"+val+",</p>";
                } else if (keys[i] === "Hours") {
                    val = "<p style='width:90%;display:inline-block' class='center'>"+val+"</p><p style='display:inline-block'>:</p>";
                } else {
                    val = "<p class='center'>"+val+"</p>";
                }

                incrbts += "<div class='ui-block-"+String.fromCharCode(97+i)+"'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>";
                inputs += "<div id='"+keys[i]+"' class='ui-block-"+String.fromCharCode(97+i)+"'>"+val+"</div>";
                decrbts += "<div class='ui-block-"+String.fromCharCode(97+i)+"'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>";
            }

            incrbts += "</fieldset>";
            inputs += "</div>";
            decrbts += "</fieldset>";

            popup.find(".ui-content").html("<span>"+incrbts+inputs+decrbts+"</span>").enhanceWithin();

            popup.find(".incr").children().on("vclick",function(){
                var pos = $(this).index();
                changeValue(popup.find(".inputs").children().eq(pos).attr("id"),1);
                return false;
            });

            popup.find(".decr").children().on("vclick",function(){
                var pos = $(this).index();
                changeValue(popup.find(".inputs").children().eq(pos).attr("id"),-1);
                return false;
            });
    };

    updateContent();

    $(".ui-page-active").append(popup);

    popup
    .css("width","280px")
    .popup({
        history: false,
        "positionTo": "window"
    })
    .one("popupafterclose",function(){
        callback(timestamp);
        popup.popup("destroy").remove();
    })
    .enhanceWithin().popup("open");
}

function changePage(toPage,opts) {
    opts = opts || {};
    if (toPage.indexOf("#") !== 0) {
        toPage = "#"+toPage;
    }

    $.mobile.pageContainer.pagecontainer("change",toPage,opts);
}

// Close the panel before page transition to avoid bug in jQM 1.4+
function changeFromPanel(page) {
    var $panel = $("#sprinklers-settings");
    $panel.one("panelclose", function(){
        changePage("#"+page);
    });
    $panel.panel("close");
}

function showTooltip(x, y, contents, color) {
    $("<div id='tooltip'>" + contents + "</div>").css( {
        position: "absolute",
        display: "none",
        top: y + 5,
        left: x + 5,
        padding: "2px",
        "text-shadow": "none",
        "background-color": color,
        color: colorContrast(color),
        opacity: 0.80
    }).appendTo("body").fadeIn(200);
}

function colorContrast(c) {
    var rgb = c.match(/rgb\((\d+),(\d+),(\d+)\)/),
        o = Math.round(((parseInt(rgb[1]) * 299) + (parseInt(rgb[2]) * 587) + (parseInt(rgb[3]) * 114)) /1000);

    return (o > 125) ? "black" : "white"; //http://www.w3.org/TR/AERT#color-contrast
}

// Show loading indicator within element(s)
function showLoading(ele) {
    ele = (typeof ele === "string") ? $(ele) : ele;
    ele.off("click").html("<p class='ui-icon ui-icon-loading mini-load'></p>");
}

function goBack(keepIndex) {
    var page = $(".ui-page-active").attr("id"),
        managerStart = (page === "site-control" && !$("#site-control").find(".ui-btn-left").is(":visible")),
        popup = $(".ui-popup-active");

    if (popup.length) {
        popup.find("[data-role='popup']").popup("close");
        return;
    }

    if (page === "sprinklers" || page === "start" || managerStart) {
        navigator.app.exitApp();
    } else {
        changePage($.mobile.navigate.history.getPrev().url);
        $.mobile.document.one("pagehide",function(){
            if (!keepIndex) {
                $.mobile.navigate.history.activeIndex -= 2;
            }
        });
    }
}

// show error message
function showerror(msg,dur) {
    dur = dur || 2500;

    $.mobile.loading("show", {
        text: msg,
        textVisible: true,
        textonly: true,
        theme: "b"
    });
    // hide after delay
    setTimeout(function(){$.mobile.loading("hide");},dur);
}

// Accessory functions
function fixInputClick(page) {
    // Handle Fast Click quirks
    if (!FastClick.notNeeded(document.body)) {
        page.find("input[type='checkbox']:not([data-role='flipswitch'])").addClass("needsclick");
        page.find(".ui-collapsible-heading-toggle").on("click",function(){
            var heading = $(this);

            setTimeout(function(){
                heading.removeClass("ui-btn-active");
            },100);
        });
        page.find(".ui-select > .ui-btn").each(function(a,b){
            var ele = $(b),
                id = ele.attr("id");

            ele.attr("data-rel","popup");
            ele.attr("href","#"+id.slice(0,-6)+"listbox");
        });
    }
}

// Insert style string into the DOM
function insertStyle(style) {
    var a=document.createElement("style");
    a.innerHTML=style;
    document.head.appendChild(a);
}

// Convert all elements in array to integer
function parseIntArray(arr) {
    for(var i=0; i<arr.length; i++) {arr[i] = +arr[i];}
    return arr;
}

// Convert seconds into (HH:)MM:SS format. HH is only reported if greater than 0.
function sec2hms(diff) {
    var str = "";
    var hours = Math.max(0, parseInt( diff / 3600 ) % 24);
    var minutes = Math.max(0, parseInt( diff / 60 ) % 60);
    var seconds = diff % 60;
    if (hours) {
        str += pad(hours)+":";
    }
    return str+pad(minutes)+":"+pad(seconds);
}

// Convert seconds into array of days, hours, minutes and seconds.
function sec2dhms(diff) {
    return {
        "days": Math.max(0, parseInt(diff / 86400)),
        "hours": Math.max(0, parseInt(diff % 86400 / 3600)),
        "minutes": Math.max(0, parseInt((diff % 86400) % 3600 / 60)),
        "seconds": Math.max(0, parseInt((diff % 86400) % 3600 % 60))
    };
}

function dhms2str(arr) {
    var str = "";
    if (arr.days) {
        str += arr.days+_("d")+" ";
    }
    if (arr.hours) {
        str += arr.hours+_("h")+" ";
    }
    if (arr.minutes) {
        str += arr.minutes+_("m")+" ";
    }
    if (arr.seconds) {
        str += arr.seconds+_("s")+" ";
    }
    if (str === "") {
        str = "0"+_("s");
    }
    return str.trim();
}

// Convert days, hours, minutes and seconds array into seconds (int).
function dhms2sec(arr) {
    return parseInt((arr.days*86400)+(arr.hours*3600)+(arr.minutes*60)+arr.seconds);
}

// Generate email link for JSON data export
function objToEmail(ele,obj,subject) {
    subject = subject || "Sprinklers Data Export on "+dateToString(new Date());
    var body = JSON.stringify(obj);
    $(ele).attr("href","mailto:?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body));
}

// Return day of the week
function getDayName(day,type) {
    var ldays = [_("Sunday"),_("Monday"),_("Tuesday"),_("Wednesday"),_("Thursday"),_("Friday"),_("Saturday")],
        sdays = [_("Sun"),_("Mon"),_("Tue"),_("Wed"),_("Thu"),_("Fri"),_("Sat")];

    if (type === "short") {
        return sdays[day.getDay()];
    } else {
        return ldays[day.getDay()];
    }
}

// Add ability to unique sort arrays
function getUnique(inputArray) {
    var outputArray = [];
    for (var i = 0; i < inputArray.length; i++) {
        if (($.inArray(inputArray[i], outputArray)) === -1) {
            outputArray.push(inputArray[i]);
        }
    }
    return outputArray;
}

// pad a single digit with a leading zero
function pad(number) {
    var r = String(number);
    if ( r.length === 1 ) {
        r = "0" + r;
    }
    return r;
}

//Localization functions
function _(key) {
    //Translate item (key) based on currently defined language
    if (typeof language === "object" && language.hasOwnProperty(key)) {
        var trans = language[key];
        return trans ? trans : key;
    } else {
        //If English
        return key;
    }
}

function set_lang() {
    //Update all static elements to the current language
    $("[data-translate]").text(function() {
        var el = $(this),
            txt = el.data("translate");

        if (el.is("input[type='submit']")) {
            el.val(_(txt));
            // Update button for jQuery Mobile
            if (el.parent("div.ui-btn").length > 0) {
                el.button("refresh");
            }
        } else {
            return _(txt);
        }
    });
    $(".ui-toolbar-back-btn").text(_("Back"));

    check_curr_lang();
}

function update_lang(lang) {
    var prefix = "";

    //Empty out the current language (English is provided as the key)
    language = {};

    if (typeof lang === "undefined") {
        storage.get("lang",function(data){
            //Identify the current browser's locale
            var locale = data.lang || navigator.language || navigator.browserLanguage || navigator.systemLanguage || navigator.userLanguage || "en";

            update_lang(locale.substring(0,2));
        });
        return;
    }

    storage.set({"lang":lang});

    if (lang === "en") {
        set_lang();
        return;
    }

    if (curr_local) {
        prefix = "http://rawgit.com/salbahra/Sprinklers/master/www/";
    }

    $.getJSON(prefix+"locale/"+lang+".json",function(store){
        language = store.messages;
        set_lang();
    }).fail(set_lang);
}

function check_curr_lang() {
    storage.get("lang",function(data){
        var popup = $("#localization");

        popup.find("a").each(function(a,b){
            var item = $(b);
            if (item.data("lang-code") === data.lang) {
                item.removeClass("ui-icon-carat-r").addClass("ui-icon-check");
            } else {
                item.removeClass("ui-icon-check").addClass("ui-icon-carat-r");
            }
        });

        popup.find("li.ui-last-child").removeClass("ui-last-child");
    });
}

function dateToString(date,toUTC) {
    var lang = $("#localization").find(".ui-icon-check").data("langCode"),
        dayNames = [_("Sun"),_("Mon"),_("Tue"),_("Wed"),_("Thr"),_("Fri"),_("Sat")],
        monthNames = [_("Jan"),_("Feb"),_("Mar"),_("Apr"),_("May"),_("Jun"),_("Jul"),_("Aug"),_("Sep"),_("Oct"),_("Nov"),_("Dec")];

    toUTC = (toUTC === false) ? false : true;

    if (toUTC) {
        date.setMinutes(date.getMinutes()+date.getTimezoneOffset());
    }

    if (lang === "de") {
        return pad(date.getDate())+"."+pad(date.getMonth())+"."+date.getFullYear()+" "+pad(date.getHours())+":"+pad(date.getMinutes())+":"+pad(date.getSeconds());
    }

    return dayNames[date.getDay()]+", "+pad(date.getDate())+" "+monthNames[date.getMonth()]+" "+date.getFullYear()+" "+pad(date.getHours())+":"+pad(date.getMinutes())+":"+pad(date.getSeconds());
}

function tzToString(prefix,tz,offset) {
    var lang = $("#localization").find(".ui-icon-check").data("langCode");

    if (lang === "de") {
        return "";
    }

    return prefix+tz+" "+offset;
}
