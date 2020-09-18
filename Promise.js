function Promise(executor) {
  if (typeof executor !== 'function') {
    throw TypeError(executor + ' is not a function')
  }

  var self = this
  self._state = 'pending'
  self._result = undefined
  self._fulfillReactions = []
  self._rejectReactions = []

  try {
    executor(resolve, reject)
  } catch (e) {
    reject(e)
  }

  function resolve(value) {
    if (self._state === 'pending') {
      self._state = 'fulfilled'
      self._result = value
      self._fulfillReactions.forEach(function(reaction) {
        scheduler(function() {
          reaction(value)
        })
      })
    }
  }

  function reject(reason) {
    if (self._state === 'pending') {
      self._state = 'rejected'
      self._result = reason
      self._rejectReactions.forEach(function(reaction) {
        scheduler(function() {
          reaction(reason)
        })
      })
    }
  }
}

Promise.prototype.then = function(onFulfilled, onRejected) {
  if (typeof onFulfilled !== 'function') {
    onFulfilled = function(value) {
      return value
    }
  }
  if (typeof onRejected !== 'function') {
    onRejected = function(reason) {
      throw reason
    }
  }

  var self = this
  var promise = new self.constructor(function(resolve, reject) {
    if (self._state === 'pending') {
      self._fulfillReactions.push(function(value) {
        try {
          resolvePromise(promise, onFulfilled(value), resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
      self._rejectReactions.push(function(reason) {
        try {
          resolvePromise(promise, onRejected(reason), resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
    } else if (self._state === 'fulfilled') {
      scheduler(function() {
        try {
          resolvePromise(promise, onFulfilled(self._result), resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
    } else if (self._state === 'rejected') {
      scheduler(function() {
        try {
          resolvePromise(promise, onRejected(self._result), resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
    }
  })

  return promise
}

Promise.prototype.catch = function(onRejected) {
  return this.then(undefined, onRejected)
}

Promise.prototype.finally = function(onFinally) {
  if (!this || (typeof this !== 'object' && typeof this !== 'function')) {
    throw TypeError('Promise.prototype.finally called on non-object')
  }

  var C = this.constructor
  var thenFinally =
    typeof onFinally === 'function'
      ? function(value) {
          return C.resolve(onFinally()).then(function() {
            return value
          })
        }
      : onFinally
  var catchFinally =
    typeof onFinally === 'function'
      ? function(reason) {
          return C.resolve(onFinally()).then(function() {
            throw reason
          })
        }
      : onFinally

  return this.then(thenFinally, catchFinally)
}

Promise.resolve = function(x) {
  return new Promise(function(resolve, reject) {
    resolve(x)
  })
}

Promise.reject = function(r) {
  return new Promise(function(resolve, reject) {
    reject(r)
  })
}

Promise.all = function(iterable) {
  return new Promise(function(resolve, reject) {
    var count = 0
    var length = iterable.length
    var values = []
    for (var i = 0; i < length; i++) {
      ;(function(i) {
        Promise.resolve(iterable[i]).then(function(value) {
          values[i] = value
          if (++count === length) {
            resolve(values)
          }
        }, reject)
      })(i)
    }
  })
}

Promise.race = function(iterable) {
  return new Promise(function(resolve, reject) {
    for (var i = 0; i < iterable.length; i++) {
      Promise.resolve(iterable[i]).then(resolve, reject)
    }
  })
}

// https://promisesaplus.com/#the-promise-resolution-procedure
function resolvePromise(promise, x, resolve, reject) {
  var then, called

  if (promise === x) {
    reject(TypeError('Chaining cycle detected for promise'))
  } else if (!!x && (typeof x === 'object' || typeof x === 'function')) {
    try {
      then = x.then
      if (typeof then === 'function') {
        try {
          then.call(
            x,
            function(y) {
              if (!called) {
                called = true
                resolvePromise(promise, y, resolve, reject)
              }
            },
            function(r) {
              if (!called) {
                called = true
                reject(r)
              }
            }
          )
        } catch (e) {
          if (!called) {
            called = true
            reject(e)
          }
        }
      } else {
        resolve(x)
      }
    } catch (e) {
      reject(e)
    }
  } else {
    resolve(x)
  }
}

////////////////////////////////////////////////////////////////////////////////

var scheduler = (function() {
  if (
    typeof self === 'undefined' &&
    typeof process === 'object' &&
    {}.toString.call(process) === '[object process]'
  ) {
    return process.nextTick
  } else if (
    typeof window === 'object' &&
    typeof window.MutationObserver === 'function'
  ) {
    return useMutationObserver
  } else {
    return setTimeout
  }
})()

function useMutationObserver(reaction) {
  var observer = new MutationObserver(reaction)
  var node = document.createTextNode('')
  observer.observe(node, { characterData: true })

  return (function() {
    node.data = Math.random()
  })()
}

Promise.resolved = Promise.resolve
Promise.rejected = Promise.reject
Promise.deferred = Promise.defer = function() {
  var dfd = {}
  dfd.promise = new Promise(function(resolve, reject) {
    dfd.resolve = resolve
    dfd.reject = reject
  })
  return dfd
}

try {
  module.exports = Promise
} catch (e) {}
