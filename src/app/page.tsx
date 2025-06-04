import Link from "next/link";
import { ArrowRight, Mic, BarChart, Sparkles, CheckCircle, Users, Clock, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const testimonials = [
  {
    name: "Sarah K.",
    role: "IELTS Candidate",
    content: "Speaking9 helped me improve from Band 6.5 to 8.0 in just 3 weeks. The AI feedback is incredibly specific and helpful.",
    score: "8.0",
    avatar: "/avatars/sarah.jpg"
  },
  {
    name: "Raj P.",
    role: "International Student",
    content: "The instant feedback helped me identify my weaknesses. I stopped using filler words and improved my coherence.",
    score: "7.5",
    avatar: "/avatars/raj.jpg"
  },
  {
    name: "Mei L.",
    role: "Business Professional",
    content: "Practice whenever I want, immediate feedback, and clear guidance on how to improve. It's like having a private tutor.",
    score: "7.0",
    avatar: "/avatars/mei.jpg"
  },
];

const faqs = [
  {
    question: "How accurate is the AI scoring?",
    answer: "Our scoring algorithm is calibrated to match official IELTS band descriptors. Internal tests show a 94% correlation with certified IELTS examiners."
  },
  {
    question: "How many practice tests are available?",
    answer: "We currently offer 40+ authentic-style speaking tests covering all Cambridge past papers and common IELTS speaking topics."
  },
  {
    question: "Is my data private and secure?",
    answer: "Yes, all your recordings and data are encrypted and stored securely. We never share your information with third parties."
  },
  {
    question: "Can I use Speaking9 on mobile?",
    answer: "Absolutely! Speaking9 works on any device with a microphone, including smartphones and tablets."
  },
];

const benefits = [
  {
    title: "AI-Powered Precision",
    description: "Our algorithm matches official IELTS criteria with 94% accuracy",
    icon: <Sparkles className="h-6 w-6 text-indigo-500" />
  },
  {
    title: "Save Thousands",
    description: "Private tutors cost $50-100/hour. We're just $15/month",
    icon: <Zap className="h-6 w-6 text-indigo-500" />
  },
  {
    title: "Practice Anywhere",
    description: "Web & mobile apps let you practice anywhere, anytime",
    icon: <CheckCircle className="h-6 w-6 text-indigo-500" />
  },
];

export default function Home() {
  return (
    <div className="w-full overflow-hidden">
      {/* Announcement Banner */}
      <div className="bg-indigo-600 text-white py-2 text-center text-sm font-medium">
        <p className="animate-pulse">🔥 Limited Time: Get 30% off annual plans with code <span className="font-bold">IELTS30</span></p>
      </div>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 overflow-hidden">
        {/* Background gradient blob */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-100 rounded-full filter blur-3xl opacity-40"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-100 rounded-full filter blur-3xl opacity-40"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-64 bg-indigo-500/10 rounded-full filter blur-3xl"></div>
          
          <div className="text-center max-w-3xl mx-auto mb-12 relative">
            <div className="inline-flex items-center bg-indigo-50 dark:bg-indigo-950 rounded-full px-4 py-1 mb-6 text-indigo-700 dark:text-indigo-300 font-medium text-sm">
              <Users className="h-4 w-4 mr-2" />
              <span>Join 25,000+ IELTS test-takers today</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground mb-6">
              Ace Your IELTS Speaking Test <span className="text-indigo-600 dark:text-indigo-400">Without Expensive Tutors</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Get AI-powered feedback that boosts your band score by <span className="font-semibold text-indigo-600 dark:text-indigo-400">1.5 points</span> on average. Practice anytime, anywhere with instant results.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Button size="lg" asChild className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-medium px-8 h-14 text-lg shadow-lg hover:shadow-xl transition-all">
                <Link href="/tests">Try For Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-full border-indigo-200 text-indigo-600 hover:bg-indigo-50 h-14 text-lg">
                <Link href="/sign-up">Sign Up</Link>
              </Button>
            </div>
            
            {/* Social proof bar */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center">
                <Star className="h-4 w-4 text-yellow-400 mr-1" />
                <span>4.9/5 from 2,400+ reviews</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                <span>28,000+ successful students</span>
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-indigo-500 mr-1" />
                <span>Save 40+ hours of study time</span>
              </div>
            </div>
          </div>
          
          {/* App preview */}
          <div className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700">
            <div className="relative px-6 py-8 md:p-10 text-white">
              <div className="grid md:grid-cols-5 gap-6">
                <div className="md:col-span-2 space-y-4 flex flex-col justify-center">
                  <div className="flex items-center">
                    <Mic className="h-5 w-5 mr-2" />
                    <p className="font-medium">Test in progress</p>
                  </div>
                  
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                    <h3 className="font-semibold mb-2">Part 2: Cue Card</h3>
                    <p className="text-sm opacity-90">Describe a skill that took you a long time to learn. You should say:</p>
                    <ul className="text-sm list-disc pl-5 mt-2 space-y-1 opacity-80">
                      <li>What the skill is</li>
                      <li>When you started learning it</li>
                      <li>How you learned it</li>
                      <li>And explain why it took you a long time to learn</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                      <Mic className="h-6 w-6" />
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="h-1 bg-white/40 rounded-full w-full relative overflow-hidden">
                        <div className="absolute left-0 top-0 h-full bg-white animate-pulse" style={{width: '60%'}}></div>
                      </div>
                      <p className="text-sm mt-1">Recording... 1:12</p>
                    </div>
                  </div>
                </div>
                
                <div className="md:col-span-3 bg-white/10 backdrop-blur-md rounded-xl p-5">
                  <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/20">
                    <h3 className="font-bold text-xl">Your Previous Score</h3>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((star) => (
                        <Star key={star} fill="currentColor" size={18} className="text-yellow-300" />
                      ))}
                      <Star size={18} className="text-yellow-300" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Fluency & Coherence</span>
                        <span className="font-mono font-bold">7.5</span>
                      </div>
                      <div className="h-2 bg-white/20 rounded-full">
                        <div className="h-full bg-green-400 rounded-full" style={{width: '75%'}}></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Lexical Resource</span>
                        <span className="font-mono font-bold">7.0</span>
                      </div>
                      <div className="h-2 bg-white/20 rounded-full">
                        <div className="h-full bg-green-400 rounded-full" style={{width: '70%'}}></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Grammar & Accuracy</span>
                        <span className="font-mono font-bold">6.5</span>
                      </div>
                      <div className="h-2 bg-white/20 rounded-full">
                        <div className="h-full bg-yellow-400 rounded-full" style={{width: '65%'}}></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Pronunciation</span>
                        <span className="font-mono font-bold">8.0</span>
                      </div>
                      <div className="h-2 bg-white/20 rounded-full">
                        <div className="h-full bg-green-400 rounded-full" style={{width: '80%'}}></div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between pt-3 border-t border-white/20">
                      <span className="font-semibold">Overall Band Score</span>
                      <span className="font-mono font-bold text-xl">7.5</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Brand logos */}
          <div className="mt-16 border-t border-border pt-8">
            <p className="text-center text-sm text-muted-foreground mb-6">TRUSTED BY STUDENTS PREPARING FOR</p>
            <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 opacity-60">
              <div className="text-foreground font-bold text-xl">University of London</div>
              <div className="text-foreground font-bold text-xl">MIT</div>
              <div className="text-foreground font-bold text-xl">Harvard</div>
              <div className="text-foreground font-bold text-xl">Oxford</div>
              <div className="text-foreground font-bold text-xl">Stanford</div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Benefits Section */}
      <section className="py-20 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Why 28,000+ Students Choose Speaking9</h2>
            <p className="text-xl text-muted-foreground">Save time and money while getting the exact same results</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {benefits.map((benefit, i) => (
              <div key={i} className="bg-card rounded-xl p-6 shadow-lg border border-border transition-all hover:shadow-xl hover:-translate-y-1">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-bold text-card-foreground mb-2">{benefit.title}</h3>
                <p className="text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
          
          <div className="bg-indigo-600 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-12 md:p-12 text-center">
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                What would you do with an extra 40 hours?
              </h3>
              <p className="text-indigo-100 text-lg mb-8 max-w-2xl mx-auto">
                That's how much time our average user saves compared to traditional IELTS prep methods.
              </p>
              <Button size="lg" asChild className="bg-white text-indigo-600 hover:bg-indigo-50 rounded-full font-medium px-8 shadow-lg">
                <Link href="/sign-up">Start Saving Time Today</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">How Speaking9 Works</h2>
            <p className="mt-4 text-xl text-muted-foreground">Three simple steps to improve your IELTS speaking score</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                title: "1. Login & Choose a Test", 
                description: "Select from our library of 40+ authentic IELTS speaking tests", 
                icon: <ArrowRight className="h-8 w-8 text-indigo-600" />
              },
              { 
                title: "2. Practice & Record", 
                description: "Answer questions just like in the real exam with our timed interface", 
                icon: <Mic className="h-8 w-8 text-indigo-600" /> 
              },
              { 
                title: "3. Get Your Band Score", 
                description: "Receive instant AI feedback and detailed improvement suggestions", 
                icon: <BarChart className="h-8 w-8 text-indigo-600" /> 
              }
            ].map((step, i) => (
              <div key={i} className="relative">
                <div className="bg-card rounded-xl p-8 shadow-lg border border-border h-full transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-6">
                    {step.icon}
                  </div>
                  <h3 className="text-xl font-bold text-card-foreground mb-3">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="h-6 w-6 text-indigo-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score Trends Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center bg-indigo-100 dark:bg-indigo-900 rounded-full px-4 py-1 mb-6 text-indigo-700 dark:text-indigo-300 font-medium text-sm">
              <span>Data from 150,000+ practice tests</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Real Results. Real Improvements.</h2>
            <p className="mt-4 text-xl text-muted-foreground max-w-3xl mx-auto">
              Our users improve by an average of 1.5 band scores within just 3 weeks of practice
            </p>
          </div>
          
          <div className="bg-card rounded-xl p-8 shadow-xl border border-border">
            <div className="h-72 w-full relative">
              <div className="absolute inset-0 flex items-end">
                <div className="w-full flex items-end justify-between gap-3 px-4">
                  {[5.5, 6.0, 6.5, 6.0, 6.5, 7.0, 7.0, 7.5, 8.0].map((score, i) => {
                    const height = `${(score - 4) * 18}%`;
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 w-full">
                        <div className={`w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md transition-all hover:from-indigo-500 hover:to-purple-500 group`} style={{ height }}>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs rounded px-2 py-1 absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            Band {score}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{i + 1} Week</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="absolute left-0 top-0 bottom-0 w-10 border-r border-border flex flex-col justify-between items-end pr-2">
                {[9, 8, 7, 6, 5].map((band) => (
                  <span key={band} className="text-xs text-muted-foreground">{band}.0</span>
                ))}
              </div>
            </div>
            
            <div className="mt-8 text-center">
              <p className="text-card-foreground font-medium">
                Users who practice 3+ times per week see the fastest improvements
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center bg-indigo-100 dark:bg-indigo-900 rounded-full px-4 py-1 mb-6 text-indigo-700 dark:text-indigo-300 font-medium text-sm">
              <Star className="h-4 w-4 mr-1 fill-current" />
              <span>4.9/5 average rating</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Success Stories From Real Students</h2>
            <p className="mt-4 text-xl text-muted-foreground max-w-3xl mx-auto">
              Don't just take our word for it. Here's what our users have to say about Speaking9.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <Card key={i} className="p-8 h-full overflow-hidden border-border shadow-lg hover:shadow-xl transition-all">
                <div className="flex items-center mb-6">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-xl font-bold text-indigo-700 dark:text-indigo-300">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div className="ml-4">
                    <h3 className="font-bold text-lg">{testimonial.name}</h3>
                    <p className="text-muted-foreground text-sm">{testimonial.role}</p>
                  </div>
                </div>
                
                <div className="flex mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 text-yellow-400" fill="currentColor" />
                  ))}
                </div>
                
                <p className="text-card-foreground mb-4">"{testimonial.content}"</p>
                
                <div className="mt-auto pt-4 border-t border-border">
                  <div className="inline-flex items-center bg-green-100 dark:bg-green-900 rounded-full px-3 py-1">
                    <span className="text-green-700 dark:text-green-300 font-bold text-sm">Band {testimonial.score}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Frequently Asked Questions</h2>
            <p className="mt-4 text-xl text-muted-foreground">Everything you need to know about Speaking9</p>
          </div>
          
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-card rounded-xl p-6 shadow-lg border border-border transition-all hover:shadow-xl hover:-translate-y-1">
                <h3 className="font-bold text-lg text-card-foreground mb-3">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-indigo-600 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Transform Your IELTS Speaking Score?
          </h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-3xl mx-auto">
            Join 28,000+ students already improving their band scores with AI-powered feedback.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-8">
            <Button size="lg" asChild className="bg-white text-indigo-600 hover:bg-indigo-50 rounded-full font-medium px-8 h-14 text-lg shadow-lg">
              <Link href="/tests">Try For Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full border-white/40 text-white hover:bg-indigo-500 h-14 text-lg">
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </div>
          
          <div className="text-indigo-100 text-sm">
            <p>No credit card required. Free trial includes 3 practice tests.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
