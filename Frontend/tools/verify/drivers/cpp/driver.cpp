// ---------------------------------------------------------------------------
// C++ verification driver.
//
// This file is APPENDED to an algorithm's `lesson.code.cpp` and compiled as one
// translation unit, then run once per expectation case. It is a dev-time Node
// harness artefact (tools/verify) and is never bundled into the browser.
//
// It does three things:
//   1. parses input.json  -> { entry, glue, args }
//   2. calls the student's function, converting each JSON argument into the
//      C++ type the function actually declares (int, vector<int>, string, ...)
//   3. writes output.json -> { ok, value }
//
// Step 2 is the interesting one: the argument types are taken from the function
// signature via template deduction, so no per-algorithm type declaration is
// needed. `int[]` in JSON becomes whatever the function asked for.
// ---------------------------------------------------------------------------

#include <cctype>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>

// ------------------------------- minimal JSON -------------------------------

struct J {
    enum T { NUL, BOOL, NUM, STR, ARR, OBJ } t = NUL;
    bool b = false;
    double num = 0;
    std::string str;
    std::vector<J> arr;
    std::vector<std::pair<std::string, J> > obj;

    bool isNum() const { return t == NUM; }
    bool isInt() const { return t == NUM && num == (double)(long long)num; }
    long long asInt() const { return (long long)num; }
    double asNum() const { return num; }
    const J& at(size_t i) const {
        static const J nil;
        return i < arr.size() ? arr[i] : nil;
    }
    const J* find(const std::string& k) const {
        for (size_t i = 0; i < obj.size(); i++)
            if (obj[i].first == k) return &obj[i].second;
        return 0;
    }
    const J& get(const std::string& k) const {
        static const J nil;
        const J* p = find(k);
        return p ? *p : nil;
    }
};

struct JParser {
    const std::string& s;
    size_t i = 0;
    explicit JParser(const std::string& src) : s(src) {}

    void ws() {
        while (i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++;
    }
    J fail(const char* what) {
        J e;
        e.t = J::STR;
        e.str = std::string("bad JSON at offset ") + std::to_string(i) + ": " + what;
        return e;
    }
    J value() {
        ws();
        if (i >= s.size()) return fail("unexpected end");
        char c = s[i];
        if (c == '{') return object();
        if (c == '[') return array();
        if (c == '"') {
            J v;
            v.t = J::STR;
            v.str = string();
            return v;
        }
        if (c == 't' || c == 'f') {
            J v;
            v.t = J::BOOL;
            if (s.compare(i, 4, "true") == 0) { v.b = true; i += 4; }
            else if (s.compare(i, 5, "false") == 0) { v.b = false; i += 5; }
            else return fail("expected true/false");
            return v;
        }
        if (c == 'n') {
            if (s.compare(i, 4, "null") != 0) return fail("expected null");
            i += 4;
            return J();
        }
        return number();
    }
    J number() {
        size_t start = i;
        if (i < s.size() && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.size() && (isdigit((unsigned char)s[i]) || s[i] == '.' || s[i] == 'e' ||
                                s[i] == 'E' || s[i] == '-' || s[i] == '+'))
            i++;
        if (start == i) return fail("expected number");
        J v;
        v.t = J::NUM;
        v.num = atof(s.substr(start, i - start).c_str());
        return v;
    }
    std::string string() {
        std::string out;
        i++;  // opening quote
        while (i < s.size() && s[i] != '"') {
            if (s[i] == '\\' && i + 1 < s.size()) {
                i++;
                char e = s[i];
                if (e == 'n') out += '\n';
                else if (e == 't') out += '\t';
                else if (e == 'r') out += '\r';
                else if (e == 'b') out += '\b';
                else if (e == 'f') out += '\f';
                else if (e == 'u') { i += 4; out += '?'; }  // not needed by our fixtures
                else out += e;
                i++;
            } else {
                out += s[i++];
            }
        }
        i++;  // closing quote
        return out;
    }
    J array() {
        J v;
        v.t = J::ARR;
        i++;
        ws();
        if (i < s.size() && s[i] == ']') { i++; return v; }
        while (true) {
            v.arr.push_back(value());
            ws();
            if (i >= s.size()) return fail("unterminated array");
            if (s[i] == ',') { i++; continue; }
            if (s[i] == ']') { i++; return v; }
            return fail("expected , or ]");
        }
    }
    J object() {
        J v;
        v.t = J::OBJ;
        i++;
        ws();
        if (i < s.size() && s[i] == '}') { i++; return v; }
        while (true) {
            ws();
            if (i >= s.size() || s[i] != '"') return fail("expected object key");
            std::string k = string();
            ws();
            if (i >= s.size() || s[i] != ':') return fail("expected :");
            i++;
            v.obj.push_back(std::make_pair(k, value()));
            ws();
            if (i >= s.size()) return fail("unterminated object");
            if (s[i] == ',') { i++; continue; }
            if (s[i] == '}') { i++; return v; }
            return fail("expected , or }");
        }
    }
};

static J jsonParse(const std::string& s) {
    JParser p(s);
    J v = p.value();
    if (v.t == J::STR && v.str.rfind("bad JSON", 0) == 0) {
        std::cerr << v.str << std::endl;
        exit(2);
    }
    return v;
}

static std::string jsonEscape(const std::string& s) {
    std::string o;
    for (size_t i = 0; i < s.size(); i++) {
        char c = s[i];
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n') o += "\\n";
        else if (c == '\r') o += "\\r";
        else if (c == '\t') o += "\\t";
        else o += c;
    }
    return o;
}

static void jsonWrite(std::ostream& o, const J& v) {
    switch (v.t) {
        case J::NUL: o << "null"; break;
        case J::BOOL: o << (v.b ? "true" : "false"); break;
        case J::NUM:
            if (v.isInt()) o << (long long)v.num;
            else {
                char buf[40];
                snprintf(buf, sizeof(buf), "%.10g", v.num);
                o << buf;
            }
            break;
        case J::STR: o << '"' << jsonEscape(v.str) << '"'; break;
        case J::ARR:
            o << '[';
            for (size_t i = 0; i < v.arr.size(); i++) {
                if (i) o << ',';
                jsonWrite(o, v.arr[i]);
            }
            o << ']';
            break;
        case J::OBJ:
            o << '{';
            for (size_t i = 0; i < v.obj.size(); i++) {
                if (i) o << ',';
                o << '"' << jsonEscape(v.obj[i].first) << "\":";
                jsonWrite(o, v.obj[i].second);
            }
            o << '}';
            break;
    }
}

// --------------------- JSON -> C++, driven by the signature -----------------
//
// One `fromJ` per type the curriculum uses. Adding a type here is the only
// change needed to let every algorithm in that language be verified.

template <class T>
struct FromJ;  // primary template is intentionally undefined: an unsupported
               // argument type is a compile error, not a silent wrong answer.

template <>
struct FromJ<int> {
    static int get(const J& j) { return (int)j.asInt(); }
};
template <>
struct FromJ<long> {
    static long get(const J& j) { return (long)j.asInt(); }
};
template <>
struct FromJ<long long> {
    static long long get(const J& j) { return j.asInt(); }
};
template <>
struct FromJ<double> {
    static double get(const J& j) { return j.asNum(); }
};
template <>
struct FromJ<float> {
    static float get(const J& j) { return (float)j.asNum(); }
};
template <>
struct FromJ<bool> {
    static bool get(const J& j) { return j.t == J::BOOL ? j.b : j.asInt() != 0; }
};
template <>
struct FromJ<std::string> {
    static std::string get(const J& j) { return j.str; }
};
template <>
struct FromJ<char> {
    static char get(const J& j) { return j.str.empty() ? 0 : j.str[0]; }
};

template <class T>
struct FromJ<std::vector<T> > {
    static std::vector<T> get(const J& j) {
        std::vector<T> out;
        out.reserve(j.arr.size());
        for (size_t i = 0; i < j.arr.size(); i++) out.push_back(FromJ<T>::get(j.arr[i]));
        return out;
    }
};

// The `graph` glue: {"nodes":[...], "edges":[[u,v,w], ...]} becomes an
// adjacency list, so the student's BFS does not have to re-scan the edge list
// on every pop (which would be a different, worse algorithm).
template <>
struct FromJ<std::vector<std::vector<std::pair<int, int> > > > {
    static std::vector<std::vector<std::pair<int, int> > > get(const J& j) {
        const J& nodes = j.get("nodes");
        const J& edges = j.get("edges");
        size_t n = nodes.arr.size();
        std::vector<std::vector<std::pair<int, int> > > adj(n);
        for (size_t e = 0; e < edges.arr.size(); e++) {
            const J& t = edges.arr[e];
            long long u = t.at(0).asInt();
            long long v = t.at(1).asInt();
            int w = t.arr.size() > 2 ? (int)t.at(2).asInt() : 1;
            if (u >= 0 && (size_t)u < n) adj[(size_t)u].push_back(std::make_pair((int)v, w));
        }
        return adj;
    }
};

// ---------------------------- C++ result -> JSON ---------------------------

static J toJ(int v) { J j; j.t = J::NUM; j.num = v; return j; }
static J toJ(long v) { J j; j.t = J::NUM; j.num = v; return j; }
static J toJ(long long v) { J j; j.t = J::NUM; j.num = (double)v; return j; }
static J toJ(double v) { J j; j.t = J::NUM; j.num = v; return j; }
static J toJ(float v) { J j; j.t = J::NUM; j.num = v; return j; }
static J toJ(bool v) { J j; j.t = J::BOOL; j.b = v; return j; }
static J toJ(const std::string& v) { J j; j.t = J::STR; j.str = v; return j; }
static J toJ(const char* v) { J j; j.t = J::STR; j.str = v ? v : ""; return j; }
static J toJ(std::nullptr_t) { return J(); }

template <class T>
static J toJ(const std::vector<T>& v) {
    J j;
    j.t = J::ARR;
    for (size_t i = 0; i < v.size(); i++) j.arr.push_back(toJ(v[i]));
    return j;
}
static J toJ(const std::vector<bool>& v) {
    J j;
    j.t = J::ARR;
    for (size_t i = 0; i < v.size(); i++) j.arr.push_back(toJ(bool(v[i])));
    return j;
}
template <class A, class B>
static J toJ(const std::pair<A, B>& p) {
    J j;
    j.t = J::ARR;
    j.arr.push_back(toJ(p.first));
    j.arr.push_back(toJ(p.second));
    return j;
}

// ------------------------------ call the entry -----------------------------

template <class F>
struct Sig;

// `Bare` strips references and cv-qualifiers.
//
// This is not cosmetic. A C++ implementation that takes its input by const
// reference — `void f(const vector<int>& a)` — is the *idiomatic* spelling, and
// template deduction hands us `A = const vector<int>&`. Without stripping, the
// lookup lands on the undefined primary template and the build fails with
// "incomplete type FromJ<const std::vector<int>&>", which reads like a bug in the
// student's code rather than in the harness. The parameter's cv-qualifiers
// describe how the function treats its input, not how the JSON maps onto it.
template <class T>
struct Bare {
    using type = typename std::remove_cv<typename std::remove_reference<T>::type>::type;
};

template <class R, class... A>
struct Sig<R (*)(A...)> {
    using ret = typename Bare<R>::type;
    static const size_t n = sizeof...(A);
    template <size_t I>
    using arg_t = typename Bare<typename std::tuple_element<I, std::tuple<A...> >::type>::type;
};

template <class F, size_t... I>
static J invokeImpl(F f, const std::vector<J>& args, std::index_sequence<I...>) {
    using S = Sig<F>;
    if (std::is_void<typename S::ret>::value) {
        f(FromJ<typename S::template arg_t<I> >::get(args[I])...);
        return J();
    }
    return toJ(f(FromJ<typename S::template arg_t<I> >::get(args[I])...));
}

template <class F>
static J invoke(F f, const std::vector<J>& args) {
    using S = Sig<F>;
    return invokeImpl<F>(f, args, std::make_index_sequence<S::n>{});
}

// ----------------------------------- main ----------------------------------

int main() {
    std::ifstream in("input.json");
    if (!in) {
        std::ofstream e("output.json");
        e << "{\"ok\":false,\"error\":\"input.json not found\"}";
        return 1;
    }
    std::stringstream ss;
    ss << in.rdbuf();
    J spec = jsonParse(ss.str());
    const J& args = spec.get("args");

    J out;
    out.t = J::OBJ;
    try {
        J value = invoke(VERIFY_ENTRY, args.arr);
        out.obj.push_back(std::make_pair(std::string("ok"), toJ(true)));
        out.obj.push_back(std::make_pair(std::string("value"), value));
    } catch (const std::exception& e) {
        out.obj.push_back(std::make_pair(std::string("ok"), toJ(false)));
        out.obj.push_back(std::make_pair(std::string("error"), toJ(std::string(e.what()))));
    } catch (...) {
        out.obj.push_back(std::make_pair(std::string("ok"), toJ(false)));
        out.obj.push_back(std::make_pair(std::string("error"), toJ("unknown exception")));
    }
    std::ofstream o("output.json");
    jsonWrite(o, out);
    return 0;
}
