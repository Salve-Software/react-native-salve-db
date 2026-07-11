#pragma once

#include <Dispatcher.hpp>
#include <condition_variable>
#include <mutex>
#include <queue>

namespace margelo::nitro::salvedb::tests {

// A Dispatcher that queues all work instead of running it immediately. The
// test's main thread drains this queue in a loop — the same thread that
// created the jsi::Runtime and is the only one allowed to touch it. Actual
// background work (Promise<T>::async) still runs on Nitro's own ThreadPool;
// this only marshals the *settlement* callback back onto the runtime-owning
// thread, exactly like a real JS-thread dispatcher would in production.
class TestDispatcher: public margelo::nitro::Dispatcher {
public:
  void runSync(std::function<void()>&& function) override {
    // Called only from the draining thread in this single-threaded test
    // harness, so it's safe to just run it inline.
    function();
  }

  void runAsync(std::function<void()>&& function) override {
    std::lock_guard<std::mutex> lock(_mutex);
    _queue.push(std::move(function));
    _condition.notify_one();
  }

  // Drains at most one pending task; returns whether one ran.
  bool drainOne() {
    std::function<void()> task;
    {
      std::lock_guard<std::mutex> lock(_mutex);
      if (_queue.empty()) return false;
      task = std::move(_queue.front());
      _queue.pop();
    }
    task();
    return true;
  }

private:
  std::mutex _mutex;
  std::condition_variable _condition;
  std::queue<std::function<void()>> _queue;
};

} // namespace margelo::nitro::salvedb::tests
