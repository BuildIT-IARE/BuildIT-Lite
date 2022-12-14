/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { globals } from '../common/platform.js';
import { logOnceWebWorkerWarning } from '../common/worker/simpleWorker.js';
function getWorker(workerId, label) {
    // Option for hosts to overwrite the worker script (used in the standalone editor)
    if (globals.MonacoEnvironment) {
        if (typeof globals.MonacoEnvironment.getWorker === 'function') {
            return globals.MonacoEnvironment.getWorker(workerId, label);
        }
        if (typeof globals.MonacoEnvironment.getWorkerUrl === 'function') {
            return new Worker(globals.MonacoEnvironment.getWorkerUrl(workerId, label));
        }
    }
    // ESM-comment-begin
    // 	if (typeof require === 'function') {
    // 		// check if the JS lives on a different origin
    // 		const workerMain = require.toUrl('./' + workerId);
    // 		const workerUrl = getWorkerBootstrapUrl(workerMain, label);
    // 		return new Worker(workerUrl, { name: label });
    // 	}
    // ESM-comment-end
    throw new Error("You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker");
}
export function getWorkerBootstrapUrl(scriptPath, label) {
    if (/^(http:)|(https:)|(file:)/.test(scriptPath)) {
        var currentUrl = String(window.location);
        var currentOrigin = currentUrl.substr(0, currentUrl.length - window.location.hash.length - window.location.search.length - window.location.pathname.length);
        if (scriptPath.substring(0, currentOrigin.length) !== currentOrigin) {
            // this is the cross-origin case
            // i.e. the webpage is running at a different origin than where the scripts are loaded from
            var myPath = 'vs/base/worker/defaultWorkerFactory.js';
            var workerBaseUrl = require.toUrl(myPath).slice(0, -myPath.length);
            var js = "/*" + label + "*/self.MonacoEnvironment={baseUrl: '" + workerBaseUrl + "'};importScripts('" + scriptPath + "');/*" + label + "*/";
            var url = "data:text/javascript;charset=utf-8," + encodeURIComponent(js);
            return url;
        }
    }
    return scriptPath + '#' + label;
}
function isPromiseLike(obj) {
    if (typeof obj.then === 'function') {
        return true;
    }
    return false;
}
/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
var WebWorker = /** @class */ (function () {
    function WebWorker(moduleId, id, label, onMessageCallback, onErrorCallback) {
        this.id = id;
        var workerOrPromise = getWorker('workerMain.js', label);
        if (isPromiseLike(workerOrPromise)) {
            this.worker = workerOrPromise;
        }
        else {
            this.worker = Promise.resolve(workerOrPromise);
        }
        this.postMessage(moduleId, []);
        this.worker.then(function (w) {
            w.onmessage = function (ev) {
                onMessageCallback(ev.data);
            };
            w.onmessageerror = onErrorCallback;
            if (typeof w.addEventListener === 'function') {
                w.addEventListener('error', onErrorCallback);
            }
        });
    }
    WebWorker.prototype.getId = function () {
        return this.id;
    };
    WebWorker.prototype.postMessage = function (message, transfer) {
        if (this.worker) {
            this.worker.then(function (w) { return w.postMessage(message, transfer); });
        }
    };
    WebWorker.prototype.dispose = function () {
        if (this.worker) {
            this.worker.then(function (w) { return w.terminate(); });
        }
        this.worker = null;
    };
    return WebWorker;
}());
var DefaultWorkerFactory = /** @class */ (function () {
    function DefaultWorkerFactory(label) {
        this._label = label;
        this._webWorkerFailedBeforeError = false;
    }
    DefaultWorkerFactory.prototype.create = function (moduleId, onMessageCallback, onErrorCallback) {
        var _this = this;
        var workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);
        if (this._webWorkerFailedBeforeError) {
            throw this._webWorkerFailedBeforeError;
        }
        return new WebWorker(moduleId, workerId, this._label || 'anonymous' + workerId, onMessageCallback, function (err) {
            logOnceWebWorkerWarning(err);
            _this._webWorkerFailedBeforeError = err;
            onErrorCallback(err);
        });
    };
    DefaultWorkerFactory.LAST_WORKER_ID = 0;
    return DefaultWorkerFactory;
}());
export { DefaultWorkerFactory };
