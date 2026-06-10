/* ═══════════════════════════════════════════
   TWSS Training Module — Self-contained
   Quiz engine + progress tracker + course-week system
   Reads purchases from Supabase, stores progress in localStorage
   ═══════════════════════════════════════════ */
(function() {
    'use strict';

    // ── SUPABASE INIT ──
    const SUPABASE_URL = 'https://fzwvxesrtdilljgrntpw.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';

    let _db = null;
    try {
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch(e) { console.error('Training: Supabase init error', e); }

    // ── COURSE NAME MAPPING (matches purchase table short names) ──
    const COURSE_MAP = {
        'C':                   { label: 'C Language',           icon: 'fas fa-code',        weeks: 8 },
        'C Language Notes':    { label: 'C Language',           icon: 'fas fa-code',        weeks: 8 },
        'C++':                 { label: 'C++ Language',         icon: 'fas fa-cube',        weeks: 8 },
        'C++ Language Notes':  { label: 'C++ Language',         icon: 'fas fa-cube',        weeks: 8 },
        'JAVA':                { label: 'JAVA Language',        icon: 'fab fa-java',        weeks: 8 },
        'JAVA Language Notes': { label: 'JAVA Language',        icon: 'fab fa-java',        weeks: 8 },
        'Python':              { label: 'Python Language',      icon: 'fab fa-python',      weeks: 8 },
        'Python Language Notes':{ label: 'Python Language',     icon: 'fab fa-python',      weeks: 8 },
        'SQL':                 { label: 'SQL Language',         icon: 'fas fa-database',    weeks: 6 },
        'SQL Language Notes':  { label: 'SQL Language',         icon: 'fas fa-database',    weeks: 6 },
        'Website & Domain Plan':     { label: 'Website & Domain',    icon: 'fas fa-globe',        weeks: 4 },
        'DSA + Full-Stack Plan':     { label: 'DSA + Full-Stack',    icon: 'fas fa-layer-group',  weeks: 12 },
        'DSA + Data Analytics Plan': { label: 'DSA + Data Analytics', icon: 'fas fa-chart-bar',   weeks: 12 },
        '4 Years College Plan':      { label: '4 Years College',     icon: 'fas fa-graduation-cap', weeks: 16 }
    };

    // ── QUIZ QUESTION BANK ──
    // Organized by course key → week → array of questions
    const QUIZ_BANK = {
        'C': {
            1: [
                { q: 'What is the correct way to declare an integer variable in C?', opts: ['int x;', 'integer x;', 'var x;', 'x int;'], ans: 0 },
                { q: 'Which header file is needed for printf() and scanf()?', opts: ['<math.h>', '<stdio.h>', '<string.h>', '<stdlib.h>'], ans: 1 },
                { q: 'What does the %d format specifier represent?', opts: ['Float', 'String', 'Integer', 'Character'], ans: 2 },
                { q: 'Which symbol is used to end a statement in C?', opts: ['.', ',', ';', ':'], ans: 2 },
                { q: 'What is the size of int on a 32-bit system?', opts: ['2 bytes', '4 bytes', '8 bytes', '1 byte'], ans: 1 }
            ],
            2: [
                { q: 'Which loop checks the condition before executing the body?', opts: ['do-while', 'while', 'for', 'switch'], ans: 1 },
                { q: 'What is the output of: printf("%d", 5>3);', opts: ['5', '3', '1', '0'], ans: 2 },
                { q: 'Which keyword is used to exit a loop prematurely?', opts: ['exit', 'break', 'continue', 'stop'], ans: 1 },
                { q: 'What does the "continue" statement do in a loop?', opts: ['Exits the program', 'Skips to next iteration', 'Restarts the loop', 'Ends the function'], ans: 1 },
                { q: 'Which is the correct for loop syntax?', opts: ['for(i=0; i<5; i++)', 'for i=0 to 5', 'for(i<5)', 'loop(i, 0, 5)'], ans: 0 }
            ],
            3: [
                { q: 'What is an array in C?', opts: ['A function', 'A collection of similar data types', 'A pointer', 'A structure'], ans: 1 },
                { q: 'How do you access the 3rd element of array arr?', opts: ['arr[2]', 'arr[3]', 'arr.3', 'arr(3)'], ans: 0 },
                { q: 'What is the index of the first element in an array?', opts: ['1', '0', '-1', 'Depends on array size'], ans: 1 },
                { q: 'Which function is used to find string length?', opts: ['strlen()', 'strlength()', 'length()', 'sizeof()'], ans: 0 },
                { q: 'What happens if you access an array out of bounds?', opts: ['Compiler error', 'Runtime error or undefined behavior', 'Returns 0', 'Returns NULL'], ans: 1 }
            ],
            4: [
                { q: 'What is a function in C?', opts: ['A variable', 'A block of code that performs a task', 'A data type', 'An operator'], ans: 1 },
                { q: 'What keyword is used to return a value from a function?', opts: ['exit', 'return', 'yield', 'output'], ans: 1 },
                { q: 'What is a function prototype?', opts: ['A function call', 'A function declaration', 'A function definition', 'A function variable'], ans: 1 },
                { q: 'Which is correct for calling a function?', opts: ['call myFunc()', 'myFunc()', 'invoke myFunc', 'run myFunc()'], ans: 1 },
                { q: 'What is recursion?', opts: ['Loop inside a function', 'A function calling itself', 'Multiple return values', 'Function overloading'], ans: 1 }
            ],
            5: [
                { q: 'What is a pointer in C?', opts: ['A variable storing address', 'A function', 'An array', 'A data type'], ans: 0 },
                { q: 'Which operator is used to get the address of a variable?', opts: ['*', '&', '#', '@'], ans: 1 },
                { q: 'Which operator dereferences a pointer?', opts: ['&', '*', '#', '->'], ans: 1 },
                { q: 'What does NULL pointer indicate?', opts: ['Points to 1', 'Points to nothing', 'Points to any address', 'Invalid pointer'], ans: 1 },
                { q: 'What is a dangling pointer?', opts: ['A pointer to a function', 'A pointer to freed memory', 'A null pointer', 'A const pointer'], ans: 1 }
            ],
            6: [
                { q: 'What is a structure in C?', opts: ['A function', 'A user-defined data type grouping variables', 'A pointer', 'An array'], ans: 1 },
                { q: 'Which operator accesses structure members?', opts: ['->', '.', '::', '#'], ans: 1 },
                { q: 'How is a structure variable declared?', opts: ['struct Name var;', 'Name var;', 'structure Name var;', 'var = struct Name'], ans: 0 },
                { q: 'What is typedef used for?', opts: ['Defining new types', 'Declaring variables', 'Creating functions', 'Memory allocation'], ans: 0 },
                { q: 'Can structures contain other structures?', opts: ['No', 'Yes, as members', 'Only pointers', 'Only arrays'], ans: 1 }
            ],
            7: [
                { q: 'Which function is used for dynamic memory allocation?', opts: ['malloc()', 'alloc()', 'new()', 'create()'], ans: 0 },
                { q: 'What does malloc() return?', opts: ['An integer', 'A void pointer', 'A char', 'A structure'], ans: 1 },
                { q: 'Which function releases dynamically allocated memory?', opts: ['delete()', 'free()', 'release()', 'remove()'], ans: 1 },
                { q: 'What does calloc() do differently from malloc()?', opts: ['Allocates more memory', 'Initializes memory to zero', 'Allocates less memory', 'Nothing different'], ans: 1 },
                { q: 'What is memory leak?', opts: ['Memory overflow', 'Failure to release allocated memory', 'Stack corruption', 'Buffer overflow'], ans: 1 }
            ],
            8: [
                { q: 'Which function opens a file in C?', opts: ['open()', 'fopen()', 'fileopen()', 'startfile()'], ans: 1 },
                { q: 'What mode opens a file for reading?', opts: ['"w"', '"r"', '"a"', '"rw"'], ans: 1 },
                { q: 'Which function reads a character from a file?', opts: ['readchar()', 'fgetc()', 'getchar()', 'freadchar()'], ans: 1 },
                { q: 'What does fclose() do?', opts: ['Deletes a file', 'Closes an open file', 'Clears file contents', 'Renames a file'], ans: 1 },
                { q: 'Which function writes formatted data to a file?', opts: ['fwrite()', 'fprintf()', 'fputf()', 'filewrite()'], ans: 1 }
            ]
        },
        'C++': {
            1: [
                { q: 'Which header is used for input/output in C++?', opts: ['<stdio.h>', '<iostream>', '<conio.h>', '<input.h>'], ans: 1 },
                { q: 'What is the correct output statement in C++?', opts: ['printf()', 'cout <<', 'echo', 'print'], ans: 1 },
                { q: 'What namespace is commonly used in C++?', opts: ['std', 'cstd', 'cpp', 'system'], ans: 0 },
                { q: 'Which symbol is used for single-line comments?', opts: ['/* */', '//', '#', '--'], ans: 1 },
                { q: 'What does endl do?', opts: ['Ends program', 'Inserts newline and flushes buffer', 'Ends a function', 'Ends a class'], ans: 1 }
            ],
            2: [
                { q: 'What is a class in C++?', opts: ['A function', 'A blueprint for objects', 'A variable', 'An operator'], ans: 1 },
                { q: 'What is an object?', opts: ['A class', 'An instance of a class', 'A function', 'A data type'], ans: 1 },
                { q: 'Which access specifier makes members accessible only within the class?', opts: ['public', 'private', 'protected', 'default'], ans: 1 },
                { q: 'What is a constructor?', opts: ['A destructor', 'A special member function called on object creation', 'An operator', 'A variable'], ans: 1 },
                { q: 'Can a class have multiple constructors?', opts: ['No', 'Yes, with different parameters', 'Only one', 'Only if virtual'], ans: 1 }
            ],
            3: [
                { q: 'What is inheritance?', opts: ['Creating objects', 'A class deriving properties from another class', 'Memory allocation', 'File handling'], ans: 1 },
                { q: 'Which keyword indicates inheritance?', opts: ['inherits', ':', 'extends', 'implements'], ans: 1 },
                { q: 'What is polymorphism?', opts: ['Single form', 'Many forms of the same entity', 'Data hiding', 'Memory management'], ans: 1 },
                { q: 'What is a virtual function?', opts: ['A static function', 'A function that can be overridden in derived class', 'A private function', 'An inline function'], ans: 1 },
                { q: 'What is function overloading?', opts: ['Same function name, different parameters', 'Multiple return values', 'Inheriting functions', 'Virtual functions'], ans: 0 }
            ],
            4: [
                { q: 'What is encapsulation?', opts: ['Hiding data by bundling with methods', 'Inheriting classes', 'Using templates', 'Memory management'], ans: 0 },
                { q: 'What is abstraction?', opts: ['Showing all details', 'Hiding complex implementation details', 'Memory allocation', 'File handling'], ans: 1 },
                { q: 'What is a friend function?', opts: ['A private function', 'A function that can access private members', 'A virtual function', 'A static function'], ans: 1 },
                { q: 'What is "this" pointer?', opts: ['A null pointer', 'Pointer to the current object', 'Pointer to parent class', 'Pointer to stack'], ans: 1 },
                { q: 'What is static member?', opts: ['A constant', 'Shared among all objects of a class', 'A local variable', 'A global variable'], ans: 1 }
            ],
            5: [
                { q: 'What is a template in C++?', opts: ['A blueprint for generic programming', 'A class', 'A function', 'An operator'], ans: 0 },
                { q: 'What does STL stand for?', opts: ['Standard Type Library', 'Standard Template Library', 'Simple Template Library', 'Static Type Library'], ans: 1 },
                { q: 'Which STL container stores elements in key-value pairs?', opts: ['vector', 'map', 'list', 'deque'], ans: 1 },
                { q: 'What is a vector in STL?', opts: ['A fixed-size array', 'A dynamic array', 'A linked list', 'A stack'], ans: 1 },
                { q: 'Which STL algorithm sorts elements?', opts: ['std::order', 'std::sort', 'std::arrange', 'std::organize'], ans: 1 }
            ],
            6: [
                { q: 'What is exception handling?', opts: ['Ignoring errors', 'Handling runtime errors gracefully', 'Compiling code', 'Optimizing code'], ans: 1 },
                { q: 'Which keyword throws an exception?', opts: ['catch', 'throw', 'try', 'error'], ans: 1 },
                { q: 'What is the purpose of try block?', opts: ['To throw exceptions', 'To wrap code that may throw exceptions', 'To catch exceptions', 'To ignore exceptions'], ans: 1 },
                { q: 'Can you have multiple catch blocks?', opts: ['No', 'Yes, for different exception types', 'Only one', 'Only if nested'], ans: 1 },
                { q: 'What is RAII?', opts: ['Resource Allocation Is Initialization', 'Random Access Integer Index', 'Runtime Array Index Increment', 'Recursive Algorithm Implementation'], ans: 0 }
            ],
            7: [
                { q: 'What is operator overloading?', opts: ['Creating new operators', 'Giving additional meaning to operators', 'Removing operators', 'Using operators in templates'], ans: 1 },
                { q: 'Can you overload the + operator?', opts: ['No', 'Yes', 'Only for integers', 'Only for classes'], ans: 1 },
                { q: 'What is a copy constructor?', opts: ['A constructor that copies files', 'A constructor that initializes an object from another object', 'A destructor', 'An assignment operator'], ans: 1 },
                { q: 'What is deep copy?', opts: ['Copying reference', 'Copying actual data to new memory', 'Shallow copy', 'No copy'], ans: 1 },
                { q: 'What is move semantics?', opts: ['Copying data', 'Transferring resources instead of copying', 'Deleting data', 'Allocating memory'], ans: 1 }
            ],
            8: [
                { q: 'What is smart pointer?', opts: ['A regular pointer', 'A pointer that automatically manages memory', 'A null pointer', 'A void pointer'], ans: 1 },
                { q: 'Which smart pointer shares ownership?', opts: ['unique_ptr', 'shared_ptr', 'weak_ptr', 'auto_ptr'], ans: 1 },
                { q: 'What is unique_ptr?', opts: ['Shared ownership pointer', 'Exclusive ownership pointer', 'Non-owning pointer', 'Deprecated pointer'], ans: 1 },
                { q: 'What does lambda function allow?', opts: ['Inline function definition', 'Class definition', 'Template definition', 'Macro definition'], ans: 0 },
                { q: 'What is the C++11 auto keyword?', opts: ['Automatic variable', 'Type deduction by compiler', 'Memory management', 'Loop control'], ans: 1 }
            ]
        },
        'JAVA': {
            1: [
                { q: 'What is the entry point of a Java program?', opts: ['start()', 'main()', 'init()', 'run()'], ans: 1 },
                { q: 'Which keyword declares a class in Java?', opts: ['struct', 'class', 'object', 'type'], ans: 1 },
                { q: 'What does JVM stand for?', opts: ['Java Variable Machine', 'Java Virtual Machine', 'Java Visual Mode', 'Java Version Manager'], ans: 1 },
                { q: 'Which is the correct main method signature?', opts: ['void main()', 'public static void main(String[] args)', 'static main()', 'public void main()'], ans: 1 },
                { q: 'What is bytecode in Java?', opts: ['Source code', 'Intermediate compiled code for JVM', 'Machine code', 'Assembly code'], ans: 1 }
            ],
            2: [
                { q: 'What are the 8 primitive types in Java?', opts: ['int, float, double, char, boolean, long, short, byte', 'int, string, float, char, bool', 'number, text, decimal, letter', 'int, Integer, float, Float'], ans: 0 },
                { q: 'Which is not a primitive type?', opts: ['int', 'String', 'char', 'boolean'], ans: 1 },
                { q: 'What is the default value of int?', opts: ['1', '0', 'null', '-1'], ans: 1 },
                { q: 'What is the size of double?', opts: ['4 bytes', '8 bytes', '2 bytes', '16 bytes'], ans: 1 },
                { q: 'What does final keyword do for a variable?', opts: ['Makes it static', 'Makes it constant', 'Makes it private', 'Makes it public'], ans: 1 }
            ],
            3: [
                { q: 'What is inheritance in Java?', opts: ['Creating new objects', 'A class acquiring properties of another class', 'Memory management', 'Exception handling'], ans: 1 },
                { q: 'Which keyword extends a class?', opts: ['implements', 'extends', 'inherits', 'super'], ans: 1 },
                { q: 'Can Java support multiple inheritance?', opts: ['Yes, directly', 'No, but through interfaces', 'Yes, always', 'Only with abstract classes'], ans: 1 },
                { q: 'What is method overriding?', opts: ['Multiple methods with same name', 'Redefining parent class method in child class', 'Constructor chaining', 'Static methods'], ans: 1 },
                { q: 'What does super keyword do?', opts: ['Calls parent class constructor/method', 'Creates super class', 'Declares a variable', 'Implements interface'], ans: 0 }
            ],
            4: [
                { q: 'What is an interface?', opts: ['A class', 'A contract of abstract methods', 'A data type', 'An operator'], ans: 1 },
                { q: 'Can an interface have default methods (Java 8+)?', opts: ['No', 'Yes', 'Only static methods', 'Only abstract methods'], ans: 1 },
                { q: 'What is abstract class?', opts: ['A class that cannot be instantiated', 'A final class', 'A static class', 'A public class'], ans: 0 },
                { q: 'Difference between abstract class and interface?', opts: ['None', 'Abstract class can have implemented methods', 'Interface has constructors', 'Same thing'], ans: 1 },
                { q: 'Can you instantiate an abstract class?', opts: ['Yes', 'No', 'Only with new keyword', 'Only in main method'], ans: 1 }
            ],
            5: [
                { q: 'What is an ArrayList?', opts: ['A fixed-size array', 'A resizable dynamic array', 'A linked list', 'A stack'], ans: 1 },
                { q: 'Which package contains collections?', opts: ['java.io', 'java.util', 'java.net', 'java.lang'], ans: 1 },
                { q: 'What is HashMap?', opts: ['A list', 'Key-value pair storage', 'A set', 'A queue'], ans: 1 },
                { q: 'What is the difference between List and Set?', opts: ['No difference', 'List allows duplicates, Set does not', 'Set allows duplicates', 'List is faster'], ans: 1 },
                { q: 'What is generics in Java?', opts: ['A type system', 'Parameterized types for type safety', 'Memory management', 'Exception handling'], ans: 1 }
            ],
            6: [
                { q: 'What is exception handling?', opts: ['Ignoring errors', 'Graceful error handling mechanism', 'Code optimization', 'Memory management'], ans: 1 },
                { q: 'Which block always executes?', opts: ['try', 'catch', 'finally', 'throw'], ans: 2 },
                { q: 'What is checked exception?', opts: ['RuntimeException', 'Exception checked at compile time', 'Error', 'NullPointerException'], ans: 1 },
                { q: 'What is unchecked exception?', opts: ['IOException', 'SQLException', 'RuntimeException and subclasses', 'ClassNotFoundException'], ans: 2 },
                { q: 'Which keyword throws an exception manually?', opts: ['catch', 'throw', 'throws', 'finally'], ans: 1 }
            ],
            7: [
                { q: 'What is multithreading?', opts: ['Single thread execution', 'Executing multiple threads concurrently', 'Sequential execution', 'Database access'], ans: 1 },
                { q: 'Which class is used to create a thread?', opts: ['Thread', 'Runnable', 'Process', 'Task'], ans: 0 },
                { q: 'What does synchronized keyword do?', opts: ['Parallel execution', 'Allows only one thread at a time', 'Creates a thread', 'Destroys a thread'], ans: 1 },
                { q: 'What is deadlock?', opts: ['Thread running', 'Threads waiting for each other indefinitely', 'Thread sleeping', 'Thread priority'], ans: 1 },
                { q: 'What is the Runnable interface?', opts: ['A class', 'A functional interface for thread tasks', 'An abstract class', 'A collection'], ans: 1 }
            ],
            8: [
                { q: 'What is JDBC?', opts: ['Java Database Connectivity', 'Java Debug Connector', 'Java Data Compiler', 'Java Design Concept'], ans: 0 },
                { q: 'What is a Connection object?', opts: ['A file', 'A session with the database', 'A thread', 'A class'], ans: 1 },
                { q: 'Which statement prevents SQL injection?', opts: ['Statement', 'PreparedStatement', 'CallableStatement', 'BatchStatement'], ans: 1 },
                { q: 'What does ResultSet represent?', opts: ['A database', 'Result of a SQL query', 'A connection', 'A statement'], ans: 1 },
                { q: 'Which method executes a SELECT query?', opts: ['executeUpdate()', 'executeQuery()', 'execute()', 'run()'], ans: 1 }
            ]
        },
        'Python': {
            1: [
                { q: 'How do you print in Python?', opts: ['echo()', 'print()', 'console.log()', 'printf()'], ans: 1 },
                { q: 'What is the correct variable declaration?', opts: ['var x = 5', 'x = 5', 'int x = 5', 'let x = 5'], ans: 1 },
                { q: 'What type is [1, 2, 3]?', opts: ['Tuple', 'List', 'Set', 'Dictionary'], ans: 1 },
                { q: 'What is Python indentation used for?', opts: ['Decoration', 'Code blocks instead of braces', 'Comments', 'Nothing'], ans: 1 },
                { q: 'Which is the correct comment syntax?', opts: ['// comment', '# comment', '/* comment */', '-- comment'], ans: 1 }
            ],
            2: [
                { q: 'What does len() function do?', opts: ['Returns length', 'Returns type', 'Returns value', 'Returns index'], ans: 0 },
                { q: 'How do you slice a list?', opts: ['list.slice()', 'list[start:end]', 'list.get()', 'list.sub()'], ans: 1 },
                { q: 'What is a dictionary?', opts: ['An ordered list', 'Key-value pairs', 'A set', 'A tuple'], ans: 1 },
                { q: 'What does append() do?', opts: ['Removes last element', 'Adds element to end', 'Sorts the list', 'Reverses the list'], ans: 1 },
                { q: 'What is the difference between list and tuple?', opts: ['Same thing', 'List is mutable, tuple is immutable', 'Tuple is mutable, list is immutable', 'No difference in speed'], ans: 1 }
            ],
            3: [
                { q: 'How do you define a function?', opts: ['function f()', 'def f():', 'fn f()', 'func f()'], ans: 1 },
                { q: 'What is a lambda function?', opts: ['A named function', 'An anonymous inline function', 'A class method', 'A recursive function'], ans: 1 },
                { q: 'What does return do?', opts: ['Prints a value', 'Exits function and sends value back', 'Pauses function', 'Loops function'], ans: 1 },
                { q: 'What are default parameters?', opts: ['Parameters with no value', 'Parameters with predefined values', 'Global variables', 'Constants'], ans: 1 },
                { q: 'What is *args?', opts: ['A single argument', 'Variable number of positional arguments', 'Keyword arguments', 'No arguments'], ans: 1 }
            ],
            4: [
                { q: 'What is a class in Python?', opts: ['A function', 'A blueprint for objects', 'A module', 'A variable'], ans: 1 },
                { q: 'What is self in a class?', opts: ['A global variable', 'Reference to the current instance', 'A class name', 'A module'], ans: 1 },
                { q: 'What is __init__ method?', opts: ['A destructor', 'Constructor method', 'A static method', 'An abstract method'], ans: 1 },
                { q: 'How does inheritance work in Python?', opts: ['class Child(Parent)', 'class Child extends Parent', 'class Child inherits Parent', 'class Child implements Parent'], ans: 0 },
                { q: 'What is method overriding?', opts: ['Creating new methods', 'Redefining parent method in child class', 'Deleting methods', 'Calling parent methods'], ans: 1 }
            ],
            5: [
                { q: 'How do you read a file in Python?', opts: ['file.read()', 'open("file").read()', 'read("file")', 'input("file")'], ans: 1 },
                { q: 'What does with statement do?', opts: ['Loop', 'Context manager for resource handling', 'Function', 'Class'], ans: 1 },
                { q: 'What is exception handling syntax?', opts: ['try-catch', 'try-except', 'try-handle', 'try-rescue'], ans: 1 },
                { q: 'What does finally block do?', opts: ['Catches errors', 'Always executes regardless of exception', 'Throws exceptions', 'Skips code'], ans: 1 },
                { q: 'How do you raise an exception?', opts: ['throw Error', 'raise Exception', 'error()', 'except()'], ans: 1 }
            ],
            6: [
                { q: 'What is a module in Python?', opts: ['A class', 'A file containing Python code', 'A function', 'A variable'], ans: 1 },
                { q: 'How do you import a module?', opts: ['#include', 'import module', 'require module', 'using module'], ans: 1 },
                { q: 'What is pip?', opts: ['A Python IDE', 'Python package installer', 'A Python version', 'A debugger'], ans: 1 },
                { q: 'What is a virtual environment?', opts: ['A virtual machine', 'Isolated Python environment', 'A cloud service', 'A database'], ans: 1 },
                { q: 'What does __name__ == "__main__" do?', opts: ['Defines main function', 'Checks if script is run directly', 'Imports module', 'Creates class'], ans: 1 }
            ],
            7: [
                { q: 'What is list comprehension?', opts: ['A loop', 'Concise way to create lists', 'A function', 'A module'], ans: 1 },
                { q: 'What is a generator?', opts: ['A function that returns values one at a time using yield', 'A class', 'A module', 'A decorator'], ans: 0 },
                { q: 'What is a decorator?', opts: ['A function that modifies another function', 'A class', 'A variable', 'A loop'], ans: 0 },
                { q: 'What is map() function?', opts: ['Creates a dictionary', 'Applies function to all items in iterable', 'Sorts a list', 'Filters items'], ans: 1 },
                { q: 'What is filter() function?', opts: ['Sorts items', 'Filters items based on condition', 'Maps items', 'Reduces items'], ans: 1 }
            ],
            8: [
                { q: 'What is pandas?', opts: ['A database', 'Data manipulation library', 'A web framework', 'A testing tool'], ans: 1 },
                { q: 'What is NumPy?', opts: ['Numerical computing library', 'A database', 'A web server', 'A graphics library'], ans: 0 },
                { q: 'What is matplotlib?', opts: ['A math library', 'Plotting and visualization library', 'A database', 'A testing framework'], ans: 1 },
                { q: 'What is Flask/Django?', opts: ['Databases', 'Web frameworks', 'Data science tools', 'Testing tools'], ans: 1 },
                { q: 'What does requests library do?', opts: ['File handling', 'HTTP requests', 'Database queries', 'Math operations'], ans: 1 }
            ]
        },
        'SQL': {
            1: [
                { q: 'What does SQL stand for?', opts: ['Structured Query Language', 'Simple Query Language', 'Standard Query Logic', 'Sequential Query Language'], ans: 0 },
                { q: 'Which command retrieves data?', opts: ['GET', 'SELECT', 'FETCH', 'RETRIEVE'], ans: 1 },
                { q: 'Which keyword filters rows?', opts: ['FILTER', 'WHERE', 'HAVING', 'LIMIT'], ans: 1 },
                { q: 'What does DISTINCT do?', opts: ['Sorts results', 'Removes duplicate rows', 'Counts rows', 'Groups rows'], ans: 1 },
                { q: 'Which clause sorts results?', opts: ['SORT BY', 'ORDER BY', 'GROUP BY', 'ARRANGE BY'], ans: 1 }
            ],
            2: [
                { q: 'What is a JOIN?', opts: ['Combining rows from multiple tables', 'Adding a column', 'Deleting rows', 'Creating a table'], ans: 0 },
                { q: 'What does INNER JOIN return?', opts: ['All rows from both tables', 'Only matching rows from both tables', 'All rows from left table', 'All rows from right table'], ans: 1 },
                { q: 'What does LEFT JOIN return?', opts: ['Only matching rows', 'All rows from left table + matched right rows', 'All rows from right table', 'No matching rows'], ans: 1 },
                { q: 'What is a self join?', opts: ['Joining two databases', 'Joining a table to itself', 'Joining three tables', 'No join at all'], ans: 1 },
                { q: 'What is a Cartesian product?', opts: ['INNER JOIN result', 'Cross join of all rows', 'LEFT JOIN result', 'RIGHT JOIN result'], ans: 1 }
            ],
            3: [
                { q: 'What does GROUP BY do?', opts: ['Sorts data', 'Groups rows with same values', 'Filters data', 'Joins tables'], ans: 1 },
                { q: 'What is the difference between WHERE and HAVING?', opts: ['No difference', 'WHERE filters rows, HAVING filters groups', 'HAVING is faster', 'WHERE is for groups'], ans: 1 },
                { q: 'Which is an aggregate function?', opts: ['CONCAT', 'COUNT', 'SUBSTRING', 'TRIM'], ans: 1 },
                { q: 'What does COUNT(*) do?', opts: ['Counts columns', 'Counts all rows', 'Counts distinct values', 'Counts null values'], ans: 1 },
                { q: 'What does AVG() return?', opts: ['Total sum', 'Average value', 'Maximum value', 'Minimum value'], ans: 1 }
            ],
            4: [
                { q: 'What is a subquery?', opts: ['A main query', 'A query inside another query', 'A join', 'A view'], ans: 1 },
                { q: 'What is a correlated subquery?', opts: ['Independent subquery', 'Subquery that references outer query', 'A join', 'A union'], ans: 1 },
                { q: 'What does EXISTS do?', opts: ['Creates a table', 'Checks if subquery returns any rows', 'Deletes rows', 'Updates rows'], ans: 1 },
                { q: 'What is UNION?', opts: ['Combines results of two queries (no duplicates)', 'Joins tables', 'Creates a view', 'Deletes data'], ans: 0 },
                { q: 'What is the difference between UNION and UNION ALL?', opts: ['No difference', 'UNION removes duplicates, UNION ALL keeps all', 'UNION ALL is slower', 'UNION ALL removes duplicates'], ans: 1 }
            ],
            5: [
                { q: 'What is normalization?', opts: ['Adding redundant data', 'Organizing data to reduce redundancy', 'Deleting data', 'Encrypting data'], ans: 1 },
                { q: 'What is 1NF?', opts: ['No duplicate columns', 'Each cell contains atomic values', 'No transitive dependencies', 'Foreign key constraints'], ans: 1 },
                { q: 'What is a primary key?', opts: ['Any column', 'Unique identifier for each row', 'A foreign key', 'A duplicate value'], ans: 1 },
                { q: 'What is a foreign key?', opts: ['A primary key', 'Reference to primary key in another table', 'An index', 'A constraint name'], ans: 1 },
                { q: 'What is 3NF?', opts: ['First normal form', 'No transitive dependencies', 'Atomic values only', 'Unique rows'], ans: 1 }
            ],
            6: [
                { q: 'What is an index?', opts: ['A table', 'Data structure for faster queries', 'A view', 'A constraint'], ans: 1 },
                { q: 'What does CREATE VIEW do?', opts: ['Creates a table', 'Creates a virtual table from query', 'Creates an index', 'Creates a database'], ans: 1 },
                { q: 'What is a stored procedure?', opts: ['A view', 'A saved SQL code that can be reused', 'An index', 'A trigger'], ans: 1 },
                { q: 'What is a trigger?', opts: ['A stored procedure', 'Code that auto-executes on table events', 'An index', 'A view'], ans: 1 },
                { q: 'What is a transaction?', opts: ['A single query', 'A unit of work that is atomic', 'A stored procedure', 'An index operation'], ans: 1 }
            ]
        }
    };

    // Map alternate course names to quiz bank keys
    const QUIZ_KEY_MAP = {
        'C': 'C', 'C Language Notes': 'C',
        'C++': 'C++', 'C++ Language Notes': 'C++',
        'JAVA': 'JAVA', 'JAVA Language Notes': 'JAVA',
        'Python': 'Python', 'Python Language Notes': 'Python',
        'SQL': 'SQL', 'SQL Language Notes': 'SQL',
        'Website & Domain Plan': 'C',       // Plans get C++ quizzes as base
        'DSA + Full-Stack Plan': 'C++',
        'DSA + Data Analytics Plan': 'Python',
        '4 Years College Plan': 'JAVA'
    };

    // ── SPEED EXAM URLS ──
    const EXAM_URLS = {
        'C': 'https://candidate.speedexam.net/openquiz.aspx?quiz=9CEF6C0359A04DA2B213B749ACE37C59',
        'C++': 'https://candidate.speedexam.net/openquiz.aspx?quiz=C12E456F8B904A3C9D15E678F9A0B1C2',
        'JAVA': 'https://candidate.speedexam.net/openquiz.aspx?quiz=D23F567A9C015B4D0E26F789A0B1C2D3',
        'Python': 'https://candidate.speedexam.net/openquiz.aspx?quiz=E34A678B0D126C5E1F37A890B1C2D3E4',
        'SQL': 'https://candidate.speedexam.net/openquiz.aspx?quiz=D89F123A5C67BB0D6E8CF345A6B7C8D9'
    };

    // ── PROGRESS STORAGE ──
    function getProgress(email) {
        try {
            return JSON.parse(localStorage.getItem('twss_training_' + email) || '{}');
        } catch(e) { return {}; }
    }

    function saveProgress(email, data) {
        try {
            localStorage.setItem('twss_training_' + email, JSON.stringify(data));
        } catch(e) { console.error('Training: save error', e); }
    }

    function recordQuizResult(email, courseKey, week, score, total) {
        const progress = getProgress(email);
        if (!progress[courseKey]) progress[courseKey] = {};
        if (!progress[courseKey][week]) progress[courseKey][week] = { attempts: 0, bestScore: 0 };
        progress[courseKey][week].attempts++;
        if (score > progress[courseKey][week].bestScore) {
            progress[courseKey][week].bestScore = score;
        }
        progress[courseKey][week].lastDate = new Date().toISOString();
        saveProgress(email, progress);
    }

    // ── ESCAPE HTML ──
    function esc(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','&':'&amp;'}[c]||c));
    }

    // ── STATE ──
    let trainEmail = null;
    let trainPurchases = [];
    let currentQuiz = null;  // { courseKey, week, questions, currentIndex, answers }

    // ── MAIN INIT ──
    async function initTraining() {
        // TEMP: Auth bypass for Google AdSense crawler review
        // Original (restore after approval):
        // const em = localStorage.getItem('userEmail');
        // const loggedIn = localStorage.getItem('loggedIn');
        // if (loggedIn === 'true' && em) {
        //     trainEmail = em;
        //     await loadPurchasesAndRender();
        // } else {
        //     renderLoginForm();
        // }

        // TEMP: Always show dashboard (with empty state if not logged in)
        const em = localStorage.getItem('userEmail');
        const loggedIn = localStorage.getItem('loggedIn');
        if (loggedIn === 'true' && em) {
            trainEmail = em;
            await loadPurchasesAndRender();
        } else {
            // Show dashboard with empty state instead of login form
            renderDashboard([]);
        }
    }

    function renderLoginForm() {
        const app = document.getElementById('training-app');
        if (!app) return;
        app.innerHTML = `
            <div class="train-login-box">
                <div class="train-login-icon"><i class="fas fa-graduation-cap"></i></div>
                <h2>Training Portal</h2>
                <p style="color:#888;margin-bottom:20px;">Enter the email used during purchase to access your training content</p>
                <input type="email" id="train-email-input" placeholder="name@example.com">
                <button class="train-btn-primary" id="train-login-btn">
                    <i class="fas fa-arrow-right"></i> Access Training
                </button>
                <div id="train-login-msg" style="margin-top:12px;font-size:0.88rem;min-height:20px;"></div>
            </div>
        `;
        document.getElementById('train-login-btn').addEventListener('click', handleLogin);
        document.getElementById('train-email-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }

    async function handleLogin() {
        const email = document.getElementById('train-email-input').value.trim();
        const msg = document.getElementById('train-login-msg');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            msg.style.color = '#f44336';
            msg.textContent = 'Please enter a valid email address.';
            return;
        }
        trainEmail = email;
        msg.style.color = '#fff';
        msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading your training content...';
        await loadPurchasesAndRender();
    }

    async function loadPurchasesAndRender() {
        if (!_db) {
            renderDashboard([]);
            return;
        }
        try {
            const { data, error } = await _db
                .from('purchase')
                .select('purchased_content')
                .eq('email', trainEmail);

            if (error) throw error;
            trainPurchases = data ? [...new Set(data.map(d => d.purchased_content))] : [];

            // Save auth
            localStorage.setItem('loggedIn', 'true');
            localStorage.setItem('userEmail', trainEmail);

            renderDashboard(trainPurchases);
        } catch(e) {
            console.error('Training: fetch error', e);
            trainPurchases = [];
            renderDashboard([]);
        }
    }

    function renderDashboard(purchases) {
        const app = document.getElementById('training-app');
        if (!app) return;

        if (!purchases.length) {
            app.innerHTML = `
                <div class="train-empty">
                    <div class="train-empty-icon"><i class="fas fa-book-open"></i></div>
                    <h2>Start Your Training Journey</h2>
                    <p style="max-width:600px;margin:0 auto 16px;line-height:1.7;">You haven't purchased any courses yet. Our training modules are designed to reinforce your learning through structured weekly quizzes. Each course includes multiple weeks of curated questions covering everything from programming fundamentals to advanced concepts. Purchase a course to unlock its full training program, including progress tracking and quiz retakes.</p>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:20px;">
                        <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px 16px;font-size:0.82rem;color:#ccc;"><i class="fas fa-check-circle" style="color:#ffd700;margin-right:6px;"></i>5 Question Quizzes</div>
                        <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px 16px;font-size:0.82rem;color:#ccc;"><i class="fas fa-check-circle" style="color:#ffd700;margin-right:6px;"></i>80% Pass Rate</div>
                        <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px 16px;font-size:0.82rem;color:#ccc;"><i class="fas fa-check-circle" style="color:#ffd700;margin-right:6px;"></i>Unlimited Retakes</div>
                        <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:10px 16px;font-size:0.82rem;color:#ccc;"><i class="fas fa-check-circle" style="color:#ffd700;margin-right:6px;"></i>Progress Tracking</div>
                    </div>
                    <a href="courses.html" class="train-btn-primary" style="display:inline-flex;padding:14px 36px;text-decoration:none;">
                        <i class="fas fa-arrow-right"></i> Browse Courses to Get Started
                    </a>
                </div>
            `;
            return;
        }

        const progress = getProgress(trainEmail);
        let totalQuizzes = 0, completedQuizzes = 0, totalBestScore = 0;

        // Build course cards
        let cardsHTML = '';
        purchases.forEach(courseName => {
            const info = COURSE_MAP[courseName];
            if (!info) return;

            const quizKey = QUIZ_KEY_MAP[courseName] || null;
            const weeks = info.weeks;
            const courseProgress = progress[quizKey] || {};
            let weekCards = '';
            let courseCompleted = 0;

            for (let w = 1; w <= weeks; w++) {
                const wp = courseProgress[w];
                const hasQuiz = quizKey && QUIZ_BANK[quizKey] && QUIZ_BANK[quizKey][w];
                const bestScore = wp ? wp.bestScore : 0;
                const attempts = wp ? wp.attempts : 0;
                const isComplete = bestScore >= 4; // 4/5 = 80%
                if (hasQuiz) totalQuizzes++;
                if (isComplete) { completedQuizzes++; courseCompleted++; }
                if (bestScore > 0) totalBestScore += bestScore;

                let statusClass = 'week-locked';
                let statusText = 'Locked';
                let clickAction = '';

                if (hasQuiz) {
                    statusClass = isComplete ? 'week-complete' : (attempts > 0 ? 'week-progress' : 'week-available');
                    statusText = isComplete ? bestScore + '/5' : (attempts > 0 ? bestScore + '/5' : 'Start');
                    clickAction = `onclick="window._startQuiz('${esc(quizKey)}', ${w})"`;
                } else {
                    // Weeks without quizzes in our bank - mark as available with exam link
                    statusClass = 'week-exam';
                    statusText = 'Exam';
                    if (EXAM_URLS[quizKey]) {
                        clickAction = `onclick="window.open('${EXAM_URLS[quizKey]}', '_blank')"`;
                    }
                }

                weekCards += `
                    <div class="week-card ${statusClass}" ${clickAction}>
                        <div class="week-num">W${w}</div>
                        <div class="week-status">${statusText}</div>
                    </div>
                `;
            }

            const coursePercent = Math.round((courseCompleted / weeks) * 100);

            cardsHTML += `
                <div class="train-course-card">
                    <div class="train-course-header">
                        <div class="train-course-icon"><i class="${info.icon}"></i></div>
                        <div class="train-course-info">
                            <h3>${esc(info.label)}</h3>
                            <p>${courseCompleted}/${weeks} weeks completed</p>
                        </div>
                        <div class="train-course-pct">${coursePercent}%</div>
                    </div>
                    <div class="train-progress-bar">
                        <div class="train-progress-fill" style="width:${coursePercent}%"></div>
                    </div>
                    <div class="train-weeks-grid">
                        ${weekCards}
                    </div>
                </div>
            `;
        });

        const overallPct = totalQuizzes > 0 ? Math.round((completedQuizzes / totalQuizzes) * 100) : 0;

        app.innerHTML = `
            <div class="train-dashboard">
                <div class="train-dash-header">
                    <div class="train-dash-title">
                        <h2><i class="fas fa-graduation-cap" style="margin-right:12px;"></i>Training Dashboard</h2>
                        <p>Your personalized learning path based on purchased courses</p>
                    </div>
                    <div class="train-dash-user">
                        <span style="color:#888;font-size:0.85rem;margin-right:10px;">${esc(trainEmail || '')}</span>
                        <button class="train-btn-exit" onclick="window._trainLogout()">
                            <i class="fas fa-sign-out-alt"></i> Exit
                        </button>
                    </div>
                </div>

                <div class="train-overview-stats">
                    <div class="train-stat-box">
                        <div class="train-stat-num">${purchases.length}</div>
                        <div class="train-stat-label">Courses</div>
                    </div>
                    <div class="train-stat-box">
                        <div class="train-stat-num">${completedQuizzes}/${totalQuizzes}</div>
                        <div class="train-stat-label">Quizzes Passed</div>
                    </div>
                    <div class="train-stat-box">
                        <div class="train-stat-num">${overallPct}%</div>
                        <div class="train-stat-label">Progress</div>
                    </div>
                    <div class="train-stat-box">
                        <div class="train-stat-num">${totalBestScore}</div>
                        <div class="train-stat-label">Total Score</div>
                    </div>
                </div>

                <div class="train-courses-list">
                    ${cardsHTML}
                </div>
            </div>
        `;
    }

    // ── QUIZ ENGINE ──
    function startQuiz(courseKey, week) {
        const questions = QUIZ_BANK[courseKey] && QUIZ_BANK[courseKey][week];
        if (!questions) return;

        currentQuiz = {
            courseKey: courseKey,
            week: week,
            questions: questions,
            currentIndex: 0,
            answers: new Array(questions.length).fill(-1)
        };

        renderQuizQuestion();
    }

    function renderQuizQuestion() {
        if (!currentQuiz) return;
        const app = document.getElementById('training-app');
        const q = currentQuiz.questions[currentQuiz.currentIndex];
        const idx = currentQuiz.currentIndex;
        const total = currentQuiz.questions.length;
        const selected = currentQuiz.answers[idx];
        const courseLabel = (COURSE_MAP[Object.keys(COURSE_MAP).find(k => QUIZ_KEY_MAP[k] === currentQuiz.courseKey)] || {}).label || currentQuiz.courseKey;

        let optsHTML = '';
        q.opts.forEach((opt, i) => {
            const isSelected = selected === i;
            optsHTML += `
                <div class="quiz-opt ${isSelected ? 'quiz-opt-selected' : ''}" onclick="window._selectAnswer(${i})">
                    <div class="quiz-opt-marker">${String.fromCharCode(65 + i)}</div>
                    <div class="quiz-opt-text">${esc(opt)}</div>
                </div>
            `;
        });

        app.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-header">
                    <div class="quiz-course-label">${esc(courseLabel)} — Week ${currentQuiz.week}</div>
                    <div class="quiz-progress-text">Question ${idx + 1} of ${total}</div>
                </div>
                <div class="quiz-progress-bar">
                    <div class="quiz-progress-fill" style="width:${((idx + 1) / total) * 100}%"></div>
                </div>
                <h3 class="quiz-question">${esc(q.q)}</h3>
                <div class="quiz-options">
                    ${optsHTML}
                </div>
                <div class="quiz-nav">
                    <button class="quiz-nav-btn" onclick="window._prevQuestion()" ${idx === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    ${idx < total - 1
                        ? `<button class="quiz-nav-btn quiz-nav-next" onclick="window._nextQuestion()">Next <i class="fas fa-chevron-right"></i></button>`
                        : `<button class="quiz-nav-btn quiz-submit-btn" onclick="window._submitQuiz()">Submit Quiz <i class="fas fa-check"></i></button>`
                    }
                </div>
            </div>
        `;
    }

    function selectAnswer(optIndex) {
        if (!currentQuiz) return;
        currentQuiz.answers[currentQuiz.currentIndex] = optIndex;
        renderQuizQuestion();
    }

    function nextQuestion() {
        if (!currentQuiz) return;
        if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) {
            currentQuiz.currentIndex++;
            renderQuizQuestion();
        }
    }

    function prevQuestion() {
        if (!currentQuiz) return;
        if (currentQuiz.currentIndex > 0) {
            currentQuiz.currentIndex--;
            renderQuizQuestion();
        }
    }

    function submitQuiz() {
        if (!currentQuiz) return;
        const q = currentQuiz.questions;
        let score = 0;
        q.forEach((question, i) => {
            if (currentQuiz.answers[i] === question.ans) score++;
        });

        recordQuizResult(trainEmail, currentQuiz.courseKey, currentQuiz.week, score, q.length);

        const app = document.getElementById('training-app');
        const passed = score >= 4; // 80%
        const courseLabel = (COURSE_MAP[Object.keys(COURSE_MAP).find(k => QUIZ_KEY_MAP[k] === currentQuiz.courseKey)] || {}).label || currentQuiz.courseKey;

        let resultsHTML = '';
        q.forEach((question, i) => {
            const isCorrect = currentQuiz.answers[i] === question.ans;
            const userAns = currentQuiz.answers[i] >= 0 ? question.opts[currentQuiz.answers[i]] : 'Not answered';
            const correctAns = question.opts[question.ans];
            resultsHTML += `
                <div class="result-item ${isCorrect ? 'result-correct' : 'result-wrong'}">
                    <div class="result-marker">${isCorrect ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>'}</div>
                    <div class="result-content">
                        <p class="result-q">${esc(question.q)}</p>
                        <p class="result-ans">Your answer: ${esc(userAns)}</p>
                        ${!isCorrect ? `<p class="result-correct-ans">Correct answer: ${esc(correctAns)}</p>` : ''}
                    </div>
                </div>
            `;
        });

        app.innerHTML = `
            <div class="quiz-result">
                <div class="quiz-result-header ${passed ? 'quiz-passed' : 'quiz-failed'}">
                    <div class="quiz-result-icon">${passed ? '<i class="fas fa-trophy"></i>' : '<i class="fas fa-redo"></i>'}</div>
                    <h2>${passed ? 'Congratulations!' : 'Keep Practicing!'}</h2>
                    <div class="quiz-result-score">${score}/${q.length}</div>
                    <p>${passed ? 'You passed this week quiz!' : 'You need 4/5 to pass. Review and try again!'}</p>
                </div>
                <div class="quiz-results-list">
                    ${resultsHTML}
                </div>
                <div class="quiz-result-actions">
                    <button class="train-btn-primary" onclick="window._startQuiz('${currentQuiz.courseKey}', ${currentQuiz.week})">
                        <i class="fas fa-redo"></i> Retake Quiz
                    </button>
                    <button class="train-btn-secondary" onclick="window._backToDashboard()">
                        <i class="fas fa-arrow-left"></i> Back to Dashboard
                    </button>
                </div>
            </div>
        `;

        currentQuiz = null;
    }

    function backToDashboard() {
        currentQuiz = null;
        renderDashboard(trainPurchases);
    }

    function trainLogout() {
        trainEmail = null;
        trainPurchases = [];
        currentQuiz = null;
        localStorage.removeItem('loggedIn');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('twss_user');
        renderLoginForm();
    }

    // ── EXPOSE FUNCTIONS ──
    window._startQuiz = startQuiz;
    window._selectAnswer = selectAnswer;
    window._nextQuestion = nextQuestion;
    window._prevQuestion = prevQuestion;
    window._submitQuiz = submitQuiz;
    window._backToDashboard = backToDashboard;
    window._trainLogout = trainLogout;

    // ── BOOT ──
    document.addEventListener('DOMContentLoaded', initTraining);
})();
